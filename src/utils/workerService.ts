/**
 * workerService.ts
 *
 * Handles all communication with the Cloudflare Worker BFF (Backend For Frontend).
 *
 * Two entry points:
 *  1. fetchAllDeviceDataFromWorker() — calls GET /api/status once on load / manual refresh.
 *     Returns the same shape as deviceBridge.fetchAllDeviceData() so the rest of the
 *     app doesn't need to change.
 *
 *  2. fetchInstantPowerFromWorkerProxy() — called by the Dashboard 1-second real-time
 *     loop.  Routes through the worker's /proxy endpoint to avoid CORS and Mixed-Content
 *     (HTTP→HTTPS) errors when reaching the local TV Box daemon.
 */

import { getCachedTuyaConfig } from './tuyaService';
import type { TempSensor, PowerMeter } from './mockData';

// ─── helpers ────────────────────────────────────────────────────────────────

/** Normalise the worker base URL: strip trailing slash, accept undefined/empty. */
function normaliseWorkerUrl(raw: string | undefined): string | null {
  if (!raw) return null;
  const trimmed = raw.trim();
  if (!trimmed) return null;
  return trimmed.endsWith('/') ? trimmed.slice(0, -1) : trimmed;
}

/** Build Authorization header value from the client secret (reuses existing convention). */
function buildAuthHeader(secret: string | undefined): string | undefined {
  if (!secret) return undefined;
  return secret.startsWith('Bearer ') ? secret : `Bearer ${secret}`;
}

// ─── /api/status ─────────────────────────────────────────────────────────────

/**
 * Calls the worker's GET /api/status endpoint with all device config params
 * forwarded as query parameters, then maps the response to the local type shapes.
 *
 * Called ONCE on initial page load or manual refresh — never polled.
 */
export const fetchAllDeviceDataFromWorker = async (): Promise<{
  mode: 'live' | 'demo';
  sensors: TempSensor[];
  power: PowerMeter | null;
}> => {
  const config = getCachedTuyaConfig();
  if (!config) throw new Error('Tuya config not found in localStorage.');

  const workerUrl = normaliseWorkerUrl(config.customProxyUrl);
  if (!workerUrl) throw new Error('No Cloudflare Worker URL configured (Custom CORS Proxy URL).');

  // Build query params that mirror the worker's getConfig() param names exactly
  const params = new URLSearchParams();
  if (config.clientId)       params.set('clientId',     config.clientId);
  if (config.clientSecret)   params.set('clientSecret', config.clientSecret);
  if (config.region)         params.set('region',       config.region);
  if (config.tempDeviceId1)  params.set('tempDeviceId1', config.tempDeviceId1);
  if (config.tempDeviceId2)  params.set('tempDeviceId2', config.tempDeviceId2);
  if (config.powerDeviceId)  params.set('powerDeviceId', config.powerDeviceId);
  if (config.tempCode1)      params.set('tempCode1',    config.tempCode1);
  if (config.humCode1)       params.set('humCode1',     config.humCode1);
  if (config.tempCode2)      params.set('tempCode2',    config.tempCode2);
  if (config.humCode2)       params.set('humCode2',     config.humCode2);
  if (config.powerCode)      params.set('powerCode',    config.powerCode);
  if (config.voltageCode)    params.set('voltageCode',  config.voltageCode);
  if (config.currentCode)    params.set('currentCode',  config.currentCode);
  if (config.energyCode)     params.set('energyCode',   config.energyCode);
  if (config.tempName1)      params.set('tempName1',    config.tempName1);
  if (config.tempLoc1)       params.set('tempLoc1',     config.tempLoc1);
  if (config.tempName2)      params.set('tempName2',    config.tempName2);
  if (config.tempLoc2)       params.set('tempLoc2',     config.tempLoc2);
  if (config.powerName)      params.set('powerName',    config.powerName);
  if (config.localTvBoxIp)   params.set('tvBoxUrl',     config.localTvBoxIp);

  const authHeader = buildAuthHeader(config.clientSecret);
  const headers: HeadersInit = { 'Accept': 'application/json' };
  if (authHeader) headers['Authorization'] = authHeader;

  const response = await fetch(`${workerUrl}/api/status?${params.toString()}`, {
    method: 'GET',
    headers,
  });

  if (!response.ok) {
    throw new Error(`Worker /api/status responded with HTTP ${response.status}`);
  }

  const data = await response.json();
  if (!data.success) {
    throw new Error(`Worker error: ${data.error || 'Unknown error from /api/status'}`);
  }

  // Map worker sensor array → TempSensor[]
  // The worker already returns scaled, processed values so no conversion needed.
  const sensors: TempSensor[] = (data.sensors || []).map((s: any): TempSensor => ({
    id:               s.id        || '',
    name:             s.name      || 'Unknown Sensor',
    location:         s.location  || '',
    currentTemp:      Number(s.currentTemp)    || 0,
    currentHumidity:  Number(s.currentHumidity) || 0,
    status:           s.status === 'online' ? 'online' : 'offline',
    battery:          Number(s.battery) || 0,
    history:          Array.isArray(s.history) ? s.history.map((h: any) => ({
      time:     String(h.time),
      temp:     Number(h.temp) || 0,
      humidity: Number(h.humidity) || 0,
    })) : [],
  }));

  // Map worker power object → PowerMeter | null
  let power: PowerMeter | null = null;
  if (data.power) {
    const p = data.power;
    power = {
      id:              p.id   || config.powerDeviceId || 'power-meter',
      name:            p.name || config.powerName     || 'Main Grid Meter',
      currentLoad:     Number(p.currentLoad)     || 0,
      voltage:         Number(p.voltage)         || 0,
      currentAmps:     Number(p.currentAmps)     || 0,
      todayKwh:        Number(p.todayKwh)        || 0,
      weekKwh:         Number(p.weekKwh)         || 0,
      monthKwh:        Number(p.monthKwh)        || 0,
      estMonthlyCost:  Number(p.estMonthlyCost)  || 0,
      hourlyHistory:   Array.isArray(p.hourlyHistory) ? p.hourlyHistory.map((h: any) => ({
        time:        String(h.time),
        loadWatts:   Number(h.loadWatts)   || 0,
        voltage:     Number(h.voltage)     || 0,
        currentAmps: Number(h.currentAmps) || 0,
      })) : [],
      // Worker returns dailyHistory as [] — Firestore-sourced daily history is not
      // available through the worker, so keep empty and let the page fall back to
      // its own Firestore fetch if needed.
      dailyHistory:    [],
      breakdown:       Array.isArray(p.breakdown) ? p.breakdown : [],
    };
  }

  return { mode: 'live', sensors, power };
};

// ─── /proxy (real-time 1-second loop) ────────────────────────────────────────

export interface WorkerProxyPowerResult {
  currentLoad: number;
  voltage: number;
  currentAmps: number;
  /** true when the data came via the worker proxy, false when direct */
  viaProxy: true;
}

/**
 * Fetches live power readings from the TV Box daemon by routing the request
 * through the Cloudflare Worker's /proxy endpoint.
 *
 * This avoids:
 *  - CORS errors (the worker adds the required headers)
 *  - Mixed-Content browser blocks (HTTP TV Box URL fetched server-side by the worker)
 *
 * @param tvBoxUrl   Full TV Box live URL, e.g. http://192.168.1.15:8080/live
 * @param workerUrl  Worker base URL (customProxyUrl), e.g. https://worker.workers.dev
 * @param secret     clientSecret used as the Bearer token for worker auth
 */
export const fetchInstantPowerFromWorkerProxy = async (
  tvBoxUrl: string,
  workerUrl: string,
  secret: string,
): Promise<WorkerProxyPowerResult | null> => {
  const normWorker = normaliseWorkerUrl(workerUrl);
  if (!normWorker) return null;

  // Ensure the TV Box URL ends with /live
  let liveUrl = tvBoxUrl.trim();
  if (liveUrl.endsWith('/')) liveUrl = liveUrl.slice(0, -1);
  if (!liveUrl.endsWith('/live')) liveUrl = `${liveUrl}/live`;

  const proxyEndpoint = `${normWorker}/proxy?url=${encodeURIComponent(liveUrl)}`;

  const authHeader = buildAuthHeader(secret);
  const headers: HeadersInit = { 'Accept': 'application/json' };
  if (authHeader) headers['Authorization'] = authHeader;

  const response = await fetch(proxyEndpoint, {
    method: 'GET',
    headers,
    signal: AbortSignal.timeout(5000),
  });

  if (!response.ok) {
    throw new Error(`Worker proxy responded with HTTP ${response.status}`);
  }

  const data = await response.json();

  // Handle the case where the worker itself returns an error object
  if (data.error) {
    throw new Error(`Worker proxy error: ${data.error}`);
  }

  if (data.currentLoad === undefined) return null;

  return {
    currentLoad:  Number(data.currentLoad),
    voltage:      data.voltage      !== undefined ? Number(data.voltage)      : 0,
    currentAmps:  data.currentAmps  !== undefined ? Number(data.currentAmps)  : 0,
    viaProxy:     true,
  };
};
