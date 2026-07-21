import React, { useState, useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { 
  fetchAllDeviceData, 
  fetchRealDailyClimateStats,
  fetchRealDayPowerStats,
  fetchRealDayClimateStats,
  fetchInstantPowerStats
} from '../utils/deviceBridge';
import { getCachedTuyaConfig } from '../utils/tuyaService';
import type { PowerMeter, TempSensor } from '../utils/mockData';
import { LineAreaChart, BarChart } from '../components/CustomChart';
import { 
  Zap, 
  TrendingUp, 
  Calendar, 
  DollarSign, 
  Clock, 
  Activity,
  AlertTriangle,
  Thermometer
} from 'lucide-react';

const getLocalTodayDateStr = () => {
  const now = new Date();
  return `${now.getFullYear()}-${(now.getMonth() + 1).toString().padStart(2, '0')}-${now.getDate().toString().padStart(2, '0')}`;
};

const getLocalCurrentMonthStr = () => {
  const now = new Date();
  return `${now.getFullYear()}-${(now.getMonth() + 1).toString().padStart(2, '0')}`;
};

const calculateDailyCostRSD = (kwh: number, hourlyKwh?: number[]) => {
  if (hourlyKwh && hourlyKwh.length === 24) {
    let cost = 0;
    hourlyKwh.forEach((val, hour) => {
      if (hour >= 0 && hour < 8) {
        cost += val * 4.15;
      } else {
        cost += val * 13.45;
      }
    });
    return cost;
  }
  // Default weighted average estimation: 70% Day (13.45), 30% Night (4.15) -> 10.66 RSD/kWh
  return kwh * 10.66;
};

const calculateTodayCostRSD = (hourlyHistory: any[]) => {
  let totalCost = 0;
  hourlyHistory.forEach(h => {
    const hour = parseInt(h.time.split(':')[0], 10);
    const kwh = h.loadWatts / 1000.0;
    if (hour >= 0 && hour < 8) {
      totalCost += kwh * 4.15;
    } else {
      totalCost += kwh * 13.45;
    }
  });
  return totalCost;
};

export const PowerDetails: React.FC = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const routeState = location.state as { sensor?: string; metric?: string } | null;

  const [powerData, setPowerData] = useState<PowerMeter | null>(null);
  const [sensors, setSensors] = useState<TempSensor[]>([]);
  const [climateHistory, setClimateHistory] = useState<{ date: string; sensors: any }[]>([]);
  const [timeRange, setTimeRange] = useState<'24h' | '30d'>('24h');
  const [selectedSensorKey, setSelectedSensorKey] = useState<string>(routeState?.sensor || 'sensor1');
  const [climateMetric, setClimateMetric] = useState<'temp' | 'humidity'>(
    routeState?.metric === 'humidity' ? 'humidity' : 'temp'
  );
  const [mode, setMode] = useState<'demo' | 'live'>('demo');
  const [loading, setLoading] = useState(true);

  // Calendar dates selection state
  const [selectedDate, setSelectedDate] = useState(getLocalTodayDateStr());
  const [selectedMonth, setSelectedMonth] = useState(getLocalCurrentMonthStr());

  // Single past day details fetched from Firestore
  const [historicalPowerDay, setHistoricalPowerDay] = useState<any | null>(null);
  const [historicalClimateDay, setHistoricalClimateDay] = useState<any | null>(null);
  const [historicalLoading, setHistoricalLoading] = useState(false);

  useEffect(() => {
    const loadData = async () => {
      setLoading(true);
      const data = await fetchAllDeviceData();
      setPowerData(data.power);
      setSensors(data.sensors);
      setMode(data.mode);

      if (data.mode === 'live') {
        const history = await fetchRealDailyClimateStats();
        setClimateHistory(history);
      } else {
        // Generate 30 days of mock climate history for demo mode
        const mockHistory = [];
        const now = new Date();
        for (let i = 29; i >= 0; i--) {
          const d = new Date(now.getTime() - i * 24 * 60 * 60 * 1000);
          const dateStr = d.toISOString().split('T')[0];
          mockHistory.push({
            date: dateStr,
            sensors: {
              sensor1: {
                avgTemp: Number((21.0 + Math.random() * 2.0).toFixed(1)),
                minTemp: Number((19.0 + Math.random() * 1.5).toFixed(1)),
                maxTemp: Number((24.0 + Math.random() * 2.0).toFixed(1)),
                avgHumidity: Math.round(40 + Math.random() * 10)
              },
              sensor2: {
                avgTemp: Number((26.0 + Math.random() * 4.0).toFixed(1)),
                minTemp: Number((22.0 + Math.random() * 3.0).toFixed(1)),
                maxTemp: Number((32.0 + Math.random() * 5.0).toFixed(1)),
                avgHumidity: Math.round(70 + Math.random() * 15)
              }
            }
          });
        }
        setClimateHistory(mockHistory);
      }
      setLoading(false);
    };
    loadData();
  }, []);

  // Periodic real-time power meter stats sync (Catering to Local TV Box IP vs Tuya Cloud Fallback)
  useEffect(() => {
    if (!powerData || mode !== 'live') return;

    let timeoutId: any = null;
    let failedAttempts = 0;
    let isActive = true;

    const runSync = async () => {
      if (!isActive) return;

      try {
        const config = getCachedTuyaConfig();
        if (!config) return;

        // 1. Try querying the local TV Box daemon if configured
        if (config.localTvBoxIp) {
          try {
            // Standardize IP format (trim trailing slash and ensure protocol)
            let localUrl = config.localTvBoxIp.trim();
            if (localUrl.toLowerCase().endsWith('/live')) {
              localUrl = localUrl.slice(0, -5);
            }
            if (!localUrl.startsWith('http://') && !localUrl.startsWith('https://')) {
              localUrl = `http://${localUrl}`;
            }
            if (localUrl.endsWith('/')) {
              localUrl = localUrl.slice(0, -1);
            }

            let fetchUrl = `${localUrl}/live`;
            let isProxied = false;
            const rawProxy = config.customProxyUrl?.trim();
            const cleanProxy = rawProxy ? (rawProxy.endsWith('/') ? rawProxy.slice(0, -1) : rawProxy) : '';

            // Bypass Mixed Content blocking in production (HTTPS) by routing through the CORS proxy
            if (window.location.protocol === 'https:' && fetchUrl.startsWith('http://') && cleanProxy) {
              fetchUrl = `${cleanProxy}?url=${encodeURIComponent(fetchUrl)}`;
              isProxied = true;
            }

            const headers: HeadersInit = {};
            if (config.clientSecret) {
              headers['Authorization'] = `Bearer ${config.clientSecret}`;
            }

            let response: Response;
            try {
              response = await fetch(fetchUrl, { 
                headers,
                signal: AbortSignal.timeout(4000) 
              });
            } catch (directErr) {
              // On localhost, if direct fetch fails (e.g. CORS or off-site), retry via CORS proxy if available
              if (!isProxied && cleanProxy && fetchUrl.startsWith('http://')) {
                const proxyFetchUrl = `${cleanProxy}?url=${encodeURIComponent(fetchUrl)}`;
                response = await fetch(proxyFetchUrl, { 
                  headers,
                  signal: AbortSignal.timeout(6000) 
                });
                isProxied = true;
              } else {
                throw directErr;
              }
            }
            if (response.ok) {
              const live = await response.json();
              if (live && live.status === 'offline') {
                throw new Error("Local daemon reported plug offline");
              }
              if (live && live.currentLoad !== undefined) {
                setPowerData(prev => prev ? {
                  ...prev,
                  currentLoad: Number(live.currentLoad),
                  voltage: live.voltage !== undefined ? Number(live.voltage) : prev.voltage,
                  currentAmps: live.currentAmps !== undefined ? Number(live.currentAmps) : prev.currentAmps
                } : null);
                failedAttempts = 0;
                return; // Local fetch succeeded, bypass cloud fallback query
              }
            }
            throw new Error(`Server returned HTTP status ${response.status}`);
          } catch (localErr: any) {
            failedAttempts++;
            if (failedAttempts < 3) {
              console.warn(`Local server fetch attempt ${failedAttempts}/3 failed, retaining current state:`, localErr);
              return; // Retain current local/proxy status and skip cloud fallback for transient delays
            }
          }
        }

        // 2. Cloud Fallback (query Cloud API only if local server is unconfigured/offline, and only query every 30s)
        const now = Date.now();
        const lastCloudCall = (window as any)._lastCloudCall || 0;
        if (now - lastCloudCall > 30000) {
          (window as any)._lastCloudCall = now;
          if (config.powerDeviceId) {
            const instant = await fetchInstantPowerStats(config.powerDeviceId, {
              powerCode: config.powerCode,
              voltageCode: config.voltageCode,
              currentCode: config.currentCode
            });
            if (instant) {
              setPowerData(prev => prev ? {
                ...prev,
                currentLoad: instant.currentLoad,
                voltage: instant.voltage,
                currentAmps: instant.currentAmps
              } : null);
            }
          }
        }
      } catch (err) {
        console.error("Error in real-time power metrics synchronization loop:", err);
      } finally {
        // Schedule next sync recursively only if active and tab is visible
        if (isActive && !document.hidden) {
          timeoutId = setTimeout(runSync, 1000);
        }
      }
    };

    const startSync = () => {
      if (timeoutId) clearTimeout(timeoutId);
      runSync();
    };

    const stopSync = () => {
      if (timeoutId) {
        clearTimeout(timeoutId);
        timeoutId = null;
      }
    };

    // Initial setup if visible
    if (!document.hidden) {
      startSync();
    }

    const handleVisibilityChange = () => {
      if (document.hidden) {
        stopSync();
      } else {
        startSync();
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);

    return () => {
      isActive = false;
      stopSync();
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [powerData === null, mode]);

  // Fetch past date stats from Firestore
  useEffect(() => {
    const loadDayHistory = async () => {
      const today = getLocalTodayDateStr();
      setHistoricalLoading(true);
      try {
        if (mode === 'live') {
          const powerDay = await fetchRealDayPowerStats(selectedDate);
          setHistoricalPowerDay(powerDay);

          if (selectedDate === today) {
            setHistoricalClimateDay(null);
          } else {
            const climateDay = await fetchRealDayClimateStats(selectedDate);
            setHistoricalClimateDay(climateDay);
          }
        } else {
          // Generate mock single day history for demo mode
          const mockHourlyPower = Array.from({ length: 24 }).map(() => Number((0.2 + Math.random() * 1.5).toFixed(3)));
          setHistoricalPowerDay({
            kwh: Number(mockHourlyPower.reduce((a, b) => a + b, 0).toFixed(1)),
            peakKw: Number((Math.max(...mockHourlyPower) * 4).toFixed(1)),
            cost: Number((mockHourlyPower.reduce((a, b) => a + b, 0) * 0.15).toFixed(2)),
            hourly: mockHourlyPower
          });

          setHistoricalClimateDay({
            date: selectedDate,
            sensors: {
              sensor1: {
                avgTemp: 21.5,
                minTemp: 19.5,
                maxTemp: 23.5,
                avgHumidity: 45,
                hourly: Array.from({ length: 24 }).map((_, h) => {
                  let temp = Number((20.0 + Math.sin((h - 6) / 24 * 2 * Math.PI) * 2.0 + Math.random() * 0.5).toFixed(1));
                  let humidity = Math.round(45 - Math.sin((h - 6) / 24 * 2 * Math.PI) * 5 + Math.random() * 3);
                  if (h === 3 || h === 4) {
                    temp = 0.0;
                    humidity = 0;
                  }
                  return { hour: h, temp, humidity };
                })
              },
              sensor2: {
                avgTemp: 27.2,
                minTemp: 23.1,
                maxTemp: 31.8,
                avgHumidity: 74,
                hourly: Array.from({ length: 24 }).map((_, h) => {
                  let temp = Number((26.0 + Math.sin((h - 6) / 24 * 2 * Math.PI) * 4.0 + Math.random() * 1.0).toFixed(1));
                  let humidity = Math.round(75 - Math.sin((h - 6) / 24 * 2 * Math.PI) * 8 + Math.random() * 5);
                  if (h === 3 || h === 4) {
                    temp = 0.0;
                    humidity = 0;
                  }
                  return { hour: h, temp, humidity };
                })
              }
            }
          });
        }
      } catch (error) {
        console.error("Error loading past day history:", error);
      } finally {
        setHistoricalLoading(false);
      }
    };

    loadDayHistory();
  }, [selectedDate, mode]);

  if (loading) {
    return (
      <div className="loading-screen">
        <Zap className="animate-spin text-accent" size={48} />
        <p>Loading analytics data...</p>
      </div>
    );
  }

  // Formatting dates helper
  const formatChartDate = (dateStr: string) => {
    if (!dateStr.includes('-')) return dateStr;
    try {
      const [year, month, day] = dateStr.split('-');
      const d = new Date(Number(year), Number(month) - 1, Number(day));
      return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
    } catch {
      return dateStr;
    }
  };

  // Cost calculations in RSD based on High/Low tariffs
  const todayCostRSD = powerData ? calculateTodayCostRSD(powerData.hourlyHistory) : 0;
  
  const monthlyCostRSD = powerData
    ? powerData.dailyHistory
        .filter(d => d.date.startsWith(selectedMonth))
        .reduce((acc, d) => {
          return acc + calculateDailyCostRSD(d.kwh, d.hourly);
        }, 0)
    : 0;

  // 1. Process Power History Chart Data (Filtered by Selected Month for 30d view)
  const todayDateStr = getLocalTodayDateStr();
  let baseDailyHistory = powerData ? [...powerData.dailyHistory] : [];
  
  if (powerData && powerData.todayKwh !== undefined) {
    const todayIndex = baseDailyHistory.findIndex(d => d.date === todayDateStr);
    if (todayIndex !== -1) {
      // Overwrite existing database record with the live todayKwh value
      baseDailyHistory[todayIndex] = {
        ...baseDailyHistory[todayIndex],
        kwh: powerData.todayKwh
      };
    } else {
      // Append today's live stats if the document is not yet saved in Firestore
      const todayMaxWatts = powerData.hourlyHistory?.length > 0 
        ? Math.max(...powerData.hourlyHistory.map(h => h.loadWatts)) 
        : 0;
      baseDailyHistory.push({
        date: todayDateStr,
        kwh: powerData.todayKwh,
        peakKw: Number((todayMaxWatts / 1000.0).toFixed(2)),
        cost: todayCostRSD,
        hourly: []
      });
    }
  }

  const powerDailyData = baseDailyHistory
    .filter(d => d.date.startsWith(selectedMonth))
    .map(d => ({
      ...d,
      date: formatChartDate(d.date)
    }));

  // 2. Resolve Selected Climate Sensor
  const selectedSensor = sensors.find(s => {
    if (selectedSensorKey === 'sensor1') return s.id === (sensors[0]?.id);
    if (selectedSensorKey === 'sensor2') return s.id === (sensors[1]?.id);
    return false;
  }) || (selectedSensorKey === 'sensor1' ? sensors[0] : sensors[1]);

  // 3. Process Climate History Chart Data (Filtered by Selected Month for 30d view)
  const climateDailyData = climateHistory
    .filter(entry => entry.date.startsWith(selectedMonth))
    .map(entry => {
      const sensorData = entry.sensors[selectedSensorKey] || {};
      return {
        date: formatChartDate(entry.date),
        temp: sensorData.avgTemp !== undefined ? sensorData.avgTemp : 0,
        humidity: sensorData.avgHumidity !== undefined ? sensorData.avgHumidity : 0
      };
    });

  // 4. Calculate Climate Stats (Averages / Min / Max)
  let avgTemp = 0;
  let minTemp = 0;
  let maxTemp = 0;
  let avgHum = 0;
  let minHum = 0;
  let maxHum = 0;

  const today = getLocalTodayDateStr();

  if (timeRange === '24h') {
    if (selectedDate === today) {
      // Live Today Stats
      const temps = (selectedSensor?.history.map(h => h.temp) || []).filter(t => t !== 0.0);
      const hums = (selectedSensor?.history.map(h => h.humidity) || []).filter(h => h !== 0.0);
      avgTemp = temps.length > 0 ? Number((temps.reduce((a, b) => a + b, 0) / temps.length).toFixed(1)) : 0;
      minTemp = temps.length > 0 ? Math.min(...temps) : 0;
      maxTemp = temps.length > 0 ? Math.max(...temps) : 0;
      avgHum = hums.length > 0 ? Math.round(hums.reduce((a, b) => a + b, 0) / hums.length) : 0;
      minHum = hums.length > 0 ? Math.min(...hums) : 0;
      maxHum = hums.length > 0 ? Math.max(...hums) : 0;
    } else {
      // Historical Single Day Stats (Fetched from Firestore)
      const hourlyList = historicalClimateDay?.sensors?.[selectedSensorKey]?.hourly || [];
      const temps = hourlyList.map((h: any) => h.temp).filter((t: any) => t !== null && t !== undefined && t !== 0.0);
      const hums = hourlyList.map((h: any) => h.humidity).filter((hu: any) => hu !== null && hu !== undefined && hu !== 0.0);
      avgTemp = temps.length > 0 ? Number((temps.reduce((a: number, b: number) => a + b, 0) / temps.length).toFixed(1)) : 0;
      minTemp = temps.length > 0 ? Math.min(...temps) : 0;
      maxTemp = temps.length > 0 ? Math.max(...temps) : 0;
      avgHum = hums.length > 0 ? Math.round(hums.reduce((a: number, b: number) => a + b, 0) / hums.length) : 0;
      minHum = hums.length > 0 ? Math.min(...hums) : 0;
      maxHum = hums.length > 0 ? Math.max(...hums) : 0;
    }
  } else {
    // 30-Day Calendar Month Stats
    const filteredClimate = climateHistory.filter(entry => entry.date.startsWith(selectedMonth));
    const dailyTemps = filteredClimate.map(entry => entry.sensors[selectedSensorKey]?.avgTemp).filter((t): t is number => t !== undefined && t !== 0.0);
    const dailyMins = filteredClimate.map(entry => entry.sensors[selectedSensorKey]?.minTemp).filter((t): t is number => t !== undefined && t !== 0.0);
    const dailyMaxs = filteredClimate.map(entry => entry.sensors[selectedSensorKey]?.maxTemp).filter((t): t is number => t !== undefined && t !== 0.0);
    const dailyHums = filteredClimate.map(entry => entry.sensors[selectedSensorKey]?.avgHumidity).filter((h): h is number => h !== undefined && h !== 0.0);

    avgTemp = dailyTemps.length > 0 ? Number((dailyTemps.reduce((a, b) => a + b, 0) / dailyTemps.length).toFixed(1)) : 0;
    minTemp = dailyMins.length > 0 ? Math.min(...dailyMins) : 0;
    maxTemp = dailyMaxs.length > 0 ? Math.max(...dailyMaxs) : 0;
    avgHum = dailyHums.length > 0 ? Math.round(dailyHums.reduce((a, b) => a + b, 0) / dailyHums.length) : 0;
    minHum = dailyHums.length > 0 ? Math.min(...dailyHums) : 0;
    maxHum = dailyHums.length > 0 ? Math.max(...dailyHums) : 0;
  }

  // Peak demand stats for Power
  const peakLoad24h = powerData ? Math.max(...powerData.hourlyHistory.map(h => h.loadWatts), 0) : 0;
  const avgLoad24h = powerData && powerData.hourlyHistory.length > 0
    ? Math.round(powerData.hourlyHistory.reduce((acc, h) => acc + h.loadWatts, 0) / powerData.hourlyHistory.length)
    : 0;

  // 5. Map Single Day Historical Chart Arrays
  let baseHourlyPower = historicalPowerDay?.hourly ? [...historicalPowerDay.hourly] : Array(24).fill(0);
  
  // If the selected date is today, and we have live todayKwh, we can merge the live current hour's usage
  if (selectedDate === today && powerData && powerData.todayKwh !== undefined) {
    const currentHour = new Date().getHours();
    
    // Calculate the sum of all hours *except* the current and future hours
    let recordedSum = 0;
    for (let h = 0; h < currentHour; h++) {
      recordedSum += baseHourlyPower[h] || 0;
    }
    
    // The difference between the live total and the sum of previous hours is the current hour's usage!
    const currentHourKwh = Math.max(0, powerData.todayKwh - recordedSum);
    baseHourlyPower[currentHour] = Number(currentHourKwh.toFixed(3));
  }

  const historicalHourlyPowerData = baseHourlyPower.map((kwh: number, hour: number) => ({
    time: `${hour.toString().padStart(2, '0')}:00`,
    kwh
  }));

  const historicalHourlyClimateData = historicalClimateDay?.sensors?.[selectedSensorKey]?.hourly
    ? historicalClimateDay.sensors[selectedSensorKey].hourly
        .map((item: any) => ({
          time: `${item.hour.toString().padStart(2, '0')}:00`,
          temp: item.temp,
          humidity: item.humidity
        }))
    : [];

  const isToday = selectedDate === today;

  // Selected Month Energy Total (dynamic based on selectedMonth)
  const selectedMonthDays = baseDailyHistory.filter(d => d.date.startsWith(selectedMonth));
  const selectedMonthEnergyTotal = Number(
    selectedMonthDays.reduce((acc, d) => acc + d.kwh, 0).toFixed(2)
  );

  // Selected Month Peak Power
  const selectedMonthPeakKw = selectedMonthDays.length > 0
    ? Math.max(...selectedMonthDays.map(d => d.peakKw), 0)
    : 0;

  // Selected Month Cost
  const selectedMonthCostRSD = Number(
    selectedMonthDays.reduce((acc, d) => {
      return acc + calculateDailyCostRSD(d.kwh, d.hourly);
    }, 0).toFixed(2)
  );

  // Selected Day Energy, Peak and Cost
  const selectedDayKwh = isToday
    ? (powerData?.todayKwh || 0)
    : (historicalPowerDay?.kwh || 0);

  const selectedDayPeakKw = isToday
    ? (peakLoad24h / 1000.0)
    : (historicalPowerDay?.peakKw || 0);

  const selectedDayCostRSD = isToday
    ? todayCostRSD
    : (historicalPowerDay ? calculateDailyCostRSD(historicalPowerDay.kwh, historicalPowerDay.hourly) : 0);

  return (
    <div className="power-details-view animate-fade-in">
      {mode === 'demo' && (
        <div className="alert-banner warning" style={{ marginBottom: '24px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <AlertTriangle size={18} />
            <span><strong>Demo Mode:</strong> Displaying simulated analytics. Configure your credentials in Settings to sync your real devices.</span>
          </div>
          <button 
            id="goto-settings-btn"
            onClick={() => navigate('/settings')} 
            className="btn secondary" 
            style={{ padding: '6px 12px', fontSize: '12px', border: '1px solid var(--color-warning)' }}
          >
            Go to Settings
          </button>
        </div>
      )}

      {/* Title Header */}
      <section className="page-header" aria-label="Page Title" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '16px' }}>
        <div className="title-group">
          <h2>Power & Climate Analytics</h2>
          <p>Detailed insight into your grid connection, energy consumption, and environmental climate history.</p>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '16px', flexWrap: 'wrap' }}>
          {/* Calendar Picker Selector */}
          {timeRange === '24h' ? (
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <span style={{ fontSize: '13px', fontWeight: 600, color: 'var(--color-text-muted)' }}>Select Day:</span>
              <input 
                type="date" 
                value={selectedDate}
                onChange={(e) => setSelectedDate(e.target.value)}
                max={getLocalTodayDateStr()}
                style={{ 
                  padding: '6px 12px', 
                  borderRadius: '6px', 
                  border: '1px solid var(--color-border)', 
                  backgroundColor: 'var(--color-card-bg)', 
                  color: 'var(--color-text)',
                  fontSize: '13px',
                  fontWeight: 600
                }}
              />
            </div>
          ) : (
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <span style={{ fontSize: '13px', fontWeight: 600, color: 'var(--color-text-muted)' }}>Select Month:</span>
              <input 
                type="month" 
                value={selectedMonth}
                onChange={(e) => setSelectedMonth(e.target.value)}
                max={getLocalCurrentMonthStr()}
                style={{ 
                  padding: '6px 12px', 
                  borderRadius: '6px', 
                  border: '1px solid var(--color-border)', 
                  backgroundColor: 'var(--color-card-bg)', 
                  color: 'var(--color-text)',
                  fontSize: '13px',
                  fontWeight: 600
                }}
              />
            </div>
          )}

          <div className="tab-control glass">
            <button 
              id="tab-range-24h"
              className={`tab-btn ${timeRange === '24h' ? 'active' : ''}`}
              onClick={() => setTimeRange('24h')}
            >
              <Clock size={14} />
              <span>Daily Profile</span>
            </button>
            <button 
              id="tab-range-30d"
              className={`tab-btn ${timeRange === '30d' ? 'active' : ''}`}
              onClick={() => setTimeRange('30d')}
            >
              <Calendar size={14} />
              <span>Monthly History</span>
            </button>
          </div>
        </div>
      </section>

      {/* KPI Cards Grid */}
      {powerData && (
        <section className="stats-kpi-grid" aria-label="Power Meter Key Statistics" style={{ marginBottom: '24px' }}>
          
          {/* Card 1: Today's Peak Load or Peak Demand */}
          <div className="kpi-card glass">
            <div className="kpi-header">
              <Zap className="kpi-icon text-accent" />
              <span className="kpi-title">
                {timeRange === '24h' 
                  ? (isToday ? "Today's Peak Load" : "Peak Load (Selected Day)") 
                  : "Peak Power (Selected Month)"}
              </span>
            </div>
            <div className="kpi-value">
              {timeRange === '24h'
                ? `${(selectedDayPeakKw * 1000).toLocaleString(undefined, { maximumFractionDigits: 0 })} W`
                : `${(selectedMonthPeakKw).toFixed(2)} kW`}
            </div>
            <div className="kpi-footer">
              <span className="text-muted">
                {timeRange === '24h'
                  ? (isToday ? "Peak load recorded today" : "Peak load recorded during selected day")
                  : "Highest demand registered during selected month"}
              </span>
            </div>
          </div>

          {/* Card 2: Energy Use (Selected Day vs Month Avg) */}
          <div className="kpi-card glass">
            <div className="kpi-header">
              <TrendingUp className="kpi-icon text-success" />
              <span className="kpi-title">
                {timeRange === '24h' 
                  ? (isToday ? "24h Energy Use" : "Energy Use (Selected Day)") 
                  : "Avg Daily Energy"}
              </span>
            </div>
            <div className="kpi-value">
              {timeRange === '24h'
                ? `${selectedDayKwh} kWh`
                : `${selectedMonthDays.length > 0 ? (selectedMonthEnergyTotal / selectedMonthDays.length).toFixed(2) : 0} kWh`}
            </div>
            <div className="kpi-footer">
              <span className="text-muted">
                {timeRange === '24h'
                  ? `CO₂ Footprint: ${(selectedDayKwh * 0.385).toFixed(2)} kg`
                  : "Daily average consumption for selected month"}
              </span>
            </div>
          </div>

          {/* Card 3: Selected Month Energy Total */}
          <div className="kpi-card glass">
            <div className="kpi-header">
              <Calendar className="kpi-icon text-primary" />
              <span className="kpi-title">Energy Total (Selected Month)</span>
            </div>
            <div className="kpi-value">{selectedMonthEnergyTotal} kWh</div>
            <div className="kpi-footer">
              <span className="text-muted">
                Days Recorded: {selectedMonthDays.length}
              </span>
            </div>
          </div>

          {/* Card 4: Cost (Selected Day vs Month Cost) */}
          <div className="kpi-card glass">
            <div className="kpi-header">
              <DollarSign className="kpi-icon text-warning" />
              <span className="kpi-title">
                {timeRange === '24h' 
                  ? (isToday ? "Today's Cost" : "Cost (Selected Day)") 
                  : "Cost (Selected Month)"}
              </span>
            </div>
            <div className="kpi-value">
              {timeRange === '24h'
                ? `${selectedDayCostRSD.toLocaleString(undefined, { maximumFractionDigits: 0 })} RSD`
                : `${selectedMonthCostRSD.toLocaleString(undefined, { maximumFractionDigits: 0 })} RSD`}
            </div>
            <div className="kpi-footer">
              <span className="text-muted">
                {timeRange === '24h'
                  ? "Calculated using High/Low Tariff schedule"
                  : "Accumulated cost for the selected month"}
              </span>
            </div>
          </div>
        </section>
      )}

      {/* Power Main Chart Section */}
      {powerData ? (
        <section className="dashboard-card chart-main-card glass" aria-labelledby="consumption-chart-title">
          <div className="card-header">
            <div className="card-title-group">
              <Activity className="card-icon text-accent" />
              <h3 id="consumption-chart-title">
                {timeRange === '24h' 
                  ? `Hourly Power Profile: ${formatChartDate(selectedDate)}`
                  : `Monthly Power Consumption: ${selectedMonth}`}
              </h3>
            </div>
          </div>
          <div className="chart-main-body">
            {historicalLoading ? (
              <div style={{ height: '260px', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', color: 'var(--color-text-muted)' }}>
                <Zap className="animate-spin text-accent" size={32} style={{ marginBottom: '12px' }} />
                <span>Fetching archive from Firestore...</span>
              </div>
            ) : timeRange === '24h' ? (
              <LineAreaChart 
                data={historicalHourlyPowerData} 
                xKey="time" 
                yKey="kwh"
                yLabel="Hourly Energy"
                color="var(--color-primary)"
                fillColor="url(#gradient-indigo)"
                height={260}
                valueSuffix=" kWh"
              />
            ) : (
              <BarChart 
                data={powerDailyData} 
                xKey="date" 
                yKey="kwh"
                yLabel="Energy Use"
                color="var(--color-primary)"
                height={260}
                valueSuffix=" kWh"
              />
            )}
          </div>
          <div className="chart-stats-summary">
            <div className="summary-stat-item">
              <span className="summary-stat-label">Peak Demand</span>
              <span className="summary-stat-val text-danger">
                {timeRange === '24h' 
                  ? (selectedDate === today 
                      ? `${(peakLoad24h / 1000).toFixed(2)} kW` 
                      : `${historicalPowerDay?.peakKw || 0} kW`)
                  : `${Math.max(...powerDailyData.map(d => d.peakKw), 0)} kW`}
              </span>
            </div>
            <div className="summary-stat-item">
              <span className="summary-stat-label">
                {timeRange === '24h' ? (selectedDate === today ? 'Average Load' : 'Total Energy') : 'Average Load'}
              </span>
              <span className="summary-stat-val">
                {timeRange === '24h' 
                  ? (selectedDate === today 
                      ? `${avgLoad24h} W` 
                      : `${historicalPowerDay?.kwh || 0} kWh`)
                  : `${(powerDailyData.reduce((acc, d) => acc + d.kwh, 0) / Math.max(1, powerDailyData.length)).toFixed(1)} kWh/day`}
              </span>
            </div>
            <div className="summary-stat-item">
              <span className="summary-stat-label">Estimated Cost</span>
              <span className="summary-stat-val text-warning">
                {timeRange === '24h' 
                  ? (selectedDate === today 
                      ? `${todayCostRSD.toFixed(1)} RSD` 
                      : `${(historicalPowerDay ? (historicalPowerDay.cost !== undefined && historicalPowerDay.cost !== null && historicalPowerDay.cost !== 0.0 ? historicalPowerDay.cost : calculateDailyCostRSD(historicalPowerDay.kwh, historicalPowerDay.hourly)) : 0).toFixed(1)} RSD`)
                  : `${monthlyCostRSD.toLocaleString(undefined, { maximumFractionDigits: 0 })} RSD`}
              </span>
            </div>
          </div>
        </section>
      ) : (
        <section className="dashboard-card glass" style={{ padding: '40px 24px', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '20px', textAlign: 'center' }}>
          <div style={{ width: '56px', height: '56px', borderRadius: '50%', backgroundColor: 'rgba(99, 102, 241, 0.1)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <Zap className="text-accent" size={28} />
          </div>
          <div>
            <h3 style={{ fontSize: '20px', fontWeight: 700, marginBottom: '8px' }}>Smart Power Meter Unconfigured</h3>
            <p style={{ fontSize: '14px', color: 'var(--color-text-muted)', lineHeight: '1.6' }}>
              Configure your Smart Power Meter Device ID in the Settings tab to view real-time consumption stats, cost details, and billing projections.
            </p>
          </div>
        </section>
      )}

      {/* Climate History Section */}
      <section className="dashboard-card chart-main-card glass" aria-labelledby="climate-history-title" style={{ marginTop: '24px' }}>
        <div className="card-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '16px' }}>
          <div className="card-title-group">
            <Thermometer className="card-icon text-primary" />
            <h3 id="climate-history-title">
              {timeRange === '24h' 
                ? (selectedDate === today 
                    ? `24-Hour Climate Profile: ${selectedSensor?.name || 'Sensor'}` 
                    : `Hourly Climate Profile: ${selectedSensor?.name || 'Sensor'} (${formatChartDate(selectedDate)})`)
                : `Monthly Climate History: ${selectedSensor?.name || 'Sensor'} (${selectedMonth})`}
            </h3>
          </div>
          
          <div style={{ display: 'flex', gap: '12px', alignItems: 'center' }}>
            {/* Sensor Selection Dropdown */}
            {sensors.length > 1 && (
              <select
                id="climate-sensor-select"
                value={selectedSensorKey}
                onChange={(e) => setSelectedSensorKey(e.target.value)}
                style={{ 
                  padding: '6px 12px', 
                  borderRadius: '6px', 
                  border: '1px solid var(--color-border)', 
                  backgroundColor: 'var(--color-card-bg)', 
                  color: 'var(--color-text)',
                  fontSize: '13px',
                  fontWeight: 600
                }}
              >
                <option value="sensor1">{sensors[0]?.name || 'Living Room Sensor'}</option>
                <option value="sensor2">{sensors[1]?.name || 'Greenhouse Sensor'}</option>
              </select>
            )}

            {/* Metric Toggle (Temp vs Humidity) */}
            <div className="tab-control glass" style={{ padding: '2px' }}>
              <button 
                id="btn-metric-temp"
                className={`tab-btn ${climateMetric === 'temp' ? 'active' : ''}`}
                onClick={() => setClimateMetric('temp')}
                style={{ padding: '4px 10px', fontSize: '12px' }}
              >
                Temp (°C)
              </button>
              <button 
                id="btn-metric-humidity"
                className={`tab-btn ${climateMetric === 'humidity' ? 'active' : ''}`}
                onClick={() => setClimateMetric('humidity')}
                style={{ padding: '4px 10px', fontSize: '12px' }}
              >
                Humidity (%)
              </button>
            </div>
          </div>
        </div>

        <div className="chart-main-body">
          {historicalLoading ? (
            <div style={{ height: '260px', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', color: 'var(--color-text-muted)' }}>
              <Zap className="animate-spin text-accent" size={32} style={{ marginBottom: '12px' }} />
              <span>Fetching archive from Firestore...</span>
            </div>
          ) : timeRange === '24h' ? (
            selectedDate === today ? (
              <LineAreaChart 
                data={selectedSensor?.history || []} 
                xKey="time" 
                yKey={climateMetric}
                yLabel={climateMetric === 'temp' ? 'Temp' : 'Humidity'}
                color={climateMetric === 'temp' ? 'var(--color-primary)' : 'var(--color-secondary)'}
                fillColor={climateMetric === 'temp' ? 'url(#gradient-indigo)' : 'url(#gradient-emerald)'}
                height={260}
                valueSuffix={climateMetric === 'temp' ? '°C' : '%'}
              />
            ) : (
              <LineAreaChart 
                data={historicalHourlyClimateData} 
                xKey="time" 
                yKey={climateMetric}
                yLabel={climateMetric === 'temp' ? 'Temp' : 'Humidity'}
                color={climateMetric === 'temp' ? 'var(--color-primary)' : 'var(--color-secondary)'}
                fillColor={climateMetric === 'temp' ? 'url(#gradient-indigo)' : 'url(#gradient-emerald)'}
                height={260}
                valueSuffix={climateMetric === 'temp' ? '°C' : '%'}
              />
            )
          ) : (
            <LineAreaChart 
              data={climateDailyData} 
              xKey="date" 
              yKey={climateMetric}
              yLabel={climateMetric === 'temp' ? 'Avg Temp' : 'Avg Humidity'}
              color={climateMetric === 'temp' ? 'var(--color-primary)' : 'var(--color-secondary)'}
              fillColor={climateMetric === 'temp' ? 'url(#gradient-indigo)' : 'url(#gradient-emerald)'}
              height={260}
              valueSuffix={climateMetric === 'temp' ? '°C' : '%'}
            />
          )}
        </div>

        <div className="chart-stats-summary">
          <div className="summary-stat-item">
            <span className="summary-stat-label">
              {climateMetric === 'temp' ? 'Average Temp' : 'Average Humidity'}
            </span>
            <span className="summary-stat-val">
              {climateMetric === 'temp' ? `${avgTemp}°C` : `${avgHum}%`}
            </span>
          </div>
          <div className="summary-stat-item">
            <span className="summary-stat-label">Minimum</span>
            <span className="summary-stat-val text-success">
              {climateMetric === 'temp' ? `${minTemp}°C` : `${minHum}%`}
            </span>
          </div>
          <div className="summary-stat-item">
            <span className="summary-stat-label">Maximum</span>
            <span className="summary-stat-val text-danger">
              {climateMetric === 'temp' ? `${maxTemp}°C` : `${maxHum}%`}
            </span>
          </div>
        </div>
      </section>
    </div>
  );
};
