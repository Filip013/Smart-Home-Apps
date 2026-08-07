import React, { createContext, useContext, useState, useEffect, useCallback, useRef } from 'react';
import { fetchAllDeviceData, fetchRealDailyClimateStats } from '../utils/deviceBridge';
import { fetchDailyHistoryAsync } from '../utils/workerService';
import { getWorkerModeEnabled } from '../utils/tuyaService';
import type { TempSensor, PowerMeter } from '../utils/mockData';

const CACHE_KEY = 'aethersmart_device_cache_v1';
const CACHE_TTL_MS = 5 * 60 * 1000; // 5 min — matches worker 24h history cache
const REFRESH_INTERVAL_MS = 30_000; // 30s background revalidation (never 1s — burns rate limits)

interface CachedPayload {
  sensors: TempSensor[];
  powerData: PowerMeter | null;
  climateHistory: { date: string; sensors: any }[];
  mode: 'demo' | 'live';
  dataSource: 'local' | 'worker';
  timestamp: number;
}

interface DeviceDataContextValue {
  sensors: TempSensor[];
  powerData: PowerMeter | null;
  climateHistory: { date: string; sensors: any }[];
  mode: 'demo' | 'live';
  loading: boolean;
  refreshing: boolean;
  error: string | null;
  dataSource: 'local' | 'worker';
  refresh: () => Promise<void>;
  setPowerData: React.Dispatch<React.SetStateAction<PowerMeter | null>>;
  setSensors: React.Dispatch<React.SetStateAction<TempSensor[]>>;
}

const DeviceDataContext = createContext<DeviceDataContextValue | undefined>(undefined);

function loadCache(): CachedPayload | null {
  try {
    const raw = localStorage.getItem(CACHE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as CachedPayload;
    if (!parsed.timestamp || Date.now() - parsed.timestamp > CACHE_TTL_MS) {
      // stale — still usable for instant paint but mark for immediate revalidate
      // we return it anyway; caller decides to show it and refresh in background
      return parsed;
    }
    return parsed;
  } catch {
    return null;
  }
}

function saveCache(payload: Omit<CachedPayload, 'timestamp'>) {
  try {
    const toSave: CachedPayload = { ...payload, timestamp: Date.now() };
    localStorage.setItem(CACHE_KEY, JSON.stringify(toSave));
  } catch (e) {
    console.warn('DeviceDataContext: failed to save cache', e);
  }
}

export const DeviceDataProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  // Hydrate synchronously from localStorage so first paint is instant (both web + Tauri webview)
  const initialCache = (() => {
    try {
      const c = loadCache();
      return c;
    } catch {
      return null;
    }
  })();

  const [sensors, setSensors] = useState<TempSensor[]>(initialCache?.sensors ?? []);
  const [powerData, setPowerData] = useState<PowerMeter | null>(initialCache?.powerData ?? null);
  const [climateHistory, setClimateHistory] = useState<{ date: string; sensors: any }[]>(initialCache?.climateHistory ?? []);
  const [mode, setMode] = useState<'demo' | 'live'>(initialCache?.mode ?? 'live');
  const [dataSource, setDataSource] = useState<'local' | 'worker'>(initialCache?.dataSource ?? (getWorkerModeEnabled() ? 'worker' : 'local'));
  const [loading, setLoading] = useState(!initialCache);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const isMountedRef = useRef(true);
  const refreshInFlightRef = useRef(false);

  const fetchAndCache = useCallback(async (isBackground = false) => {
    if (refreshInFlightRef.current) return;
    refreshInFlightRef.current = true;
    if (isBackground) setRefreshing(true);
    else if (!initialCache) setLoading(true);

    try {
      const data = await fetchAllDeviceData();
      let nextPower = data.power;
      let nextSensors = data.sensors;
      let nextMode = data.mode as 'demo' | 'live';
      let nextDataSource: 'local' | 'worker' = getWorkerModeEnabled() ? 'worker' : 'local';

      // Phase 2: Firestore dailyHistory backfill when worker mode is on (same as Dashboard/PowerDetails today)
      if (getWorkerModeEnabled() && data.powerDeviceId && data.power) {
        try {
          const history = await fetchDailyHistoryAsync(data.powerDeviceId, data.energyCode || 'add_ele');
          if (nextPower) {
            nextPower = {
              ...nextPower,
              dailyHistory: history.dailyHistory,
              weekKwh: history.weekKwh,
              monthKwh: history.monthKwh,
              estMonthlyCost: history.estMonthlyCost,
              breakdown: history.breakdown,
            };
          }
        } catch (e) {
          console.warn('DeviceDataContext: Firestore dailyHistory backfill failed (non-fatal)', e);
        }
      }

      // ClimateHistory (live only) — same calls as PowerDetails/ExportPrint today
      let nextClimateHistory: { date: string; sensors: any }[] = [];
      if (nextMode === 'live') {
        try {
          nextClimateHistory = await fetchRealDailyClimateStats();
        } catch (e) {
          console.warn('DeviceDataContext: climateHistory fetch failed (non-fatal)', e);
          // keep previous climateHistory on error to avoid flicker
          nextClimateHistory = climateHistory;
        }
      } else {
        // demo mode: keep empty — individual pages can synthesize mocks if they want,
        // but we provide at least an empty array so tab switch stays instant
        nextClimateHistory = [];
      }

      if (!isMountedRef.current) return;

      setSensors(nextSensors);
      setPowerData(nextPower);
      setClimateHistory(nextClimateHistory);
      setMode(nextMode);
      setDataSource(nextDataSource);
      setError(null);

      // Persist for next cold start / tab revisit — works for both web localStorage
      // and Tauri webview localStorage (which is file-backed under the hood).
      // Future Tauri upgrade: swap to `tauri-plugin-store` for encrypted file cache
      // via `invoke('plugin:store|set', ...)` without changing consumers.
      saveCache({
        sensors: nextSensors,
        powerData: nextPower,
        climateHistory: nextClimateHistory,
        mode: nextMode,
        dataSource: nextDataSource,
      });
    } catch (e: any) {
      console.error('DeviceDataContext: fetchAllDeviceData failed', e);
      if (!isMountedRef.current) return;
      // keep stale cache visible, just surface error for debugging
      setError(e?.message || String(e));
    } finally {
      if (isMountedRef.current) {
        setLoading(false);
        setRefreshing(false);
      }
      refreshInFlightRef.current = false;
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps -- climateHistory intentionally not dep to avoid loops

  // Initial load: if we had a cache, show it instantly and revalidate in background
  useEffect(() => {
    isMountedRef.current = true;
    if (initialCache) {
      // stale-while-revalidate — paint cache instantly, refresh behind
      fetchAndCache(true);
    } else {
      fetchAndCache(false);
    }
    return () => {
      isMountedRef.current = false;
    };
  }, [fetchAndCache]);

  // Background polling every 30s — single timer for the whole app instead of one per tab
  useEffect(() => {
    const id = setInterval(() => {
      // don't poll when tab is hidden — saves worker/Tuya rate limits
      if (document.hidden) return;
      fetchAndCache(true);
    }, REFRESH_INTERVAL_MS);

    const onVisibility = () => {
      if (!document.hidden) {
        // when user comes back to tab, revalidate if cache is older than TTL
        const cached = loadCache();
        if (!cached || Date.now() - cached.timestamp > CACHE_TTL_MS) {
          fetchAndCache(true);
        }
      }
    };
    document.addEventListener('visibilitychange', onVisibility);

    return () => {
      clearInterval(id);
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }, [fetchAndCache]);

  const refresh = useCallback(async () => {
    await fetchAndCache(false);
  }, [fetchAndCache]);

  const value: DeviceDataContextValue = {
    sensors,
    powerData,
    climateHistory,
    mode,
    loading,
    refreshing,
    error,
    dataSource,
    refresh,
    setPowerData,
    setSensors,
  };

  return <DeviceDataContext.Provider value={value}>{children}</DeviceDataContext.Provider>;
};

export const useDeviceData = (): DeviceDataContextValue => {
  const ctx = useContext(DeviceDataContext);
  if (!ctx) throw new Error('useDeviceData must be used within DeviceDataProvider');
  return ctx;
};
