import { getDeviceStatus, getTuyaConfig, makeTuyaRequest, auth, fetchFirestoreDailyPowerStats, fetchFirestoreDailyClimateStats, fetchFirestoreDayPowerStats, fetchFirestoreDayClimateStats } from './tuyaService';
import type { TempSensor, PowerMeter, TempReading } from './mockData';


// Check if credentials are fully configured
export const isLiveMode = async (): Promise<boolean> => {
  try {
    const config = await getTuyaConfig();
    return !!(config && config.clientId && config.clientSecret);
  } catch {
    return false;
  }
};

// Helper: safe value division based on common Tuya scales
const parseTuyaVal = (val: any, defaultDivisor: number = 1): number => {
  const num = Number(val);
  if (isNaN(num)) return 0;
  return num / defaultDivisor;
};

// Standardize Temperature scaling
const scaleTemp = (val: any): number => {
  const num = Number(val);
  if (isNaN(num)) return 0;
  return num > 100 ? num / 10 : num;
};

// Standardize Humidity scaling
const scaleHumidity = (val: any): number => {
  const num = Number(val);
  if (isNaN(num)) return 0;
  return num > 100 ? num / 10 : num;
};

// Standardize Power scaling
const scalePower = (val: any): number => {
  const num = Number(val);
  if (isNaN(num)) return 0;
  return num / 10;
};

// Standardize Voltage scaling
const scaleVoltage = (val: any): number => {
  const num = Number(val);
  if (isNaN(num)) return 0;
  return num > 1000 ? num / 10 : num;
};

// Standardize Current scaling (Tuya reports current in mA, so we divide by 1000 to get Amps)
const scaleCurrent = (val: any): number => {
  const num = Number(val);
  if (isNaN(num)) return 0;
  return num / 1000;
};

// Query actual 24h temperature logs from Tuya OpenAPI (paginating to ensure we get the full 24h of data)
export const fetchRealTempHistory = async (
  deviceId: string,
  tCode: string,
  hCode: string
): Promise<TempReading[]> => {
  try {
    // Tuya logs query expects Unix milliseconds (13 digits)
    const endTime = Date.now();
    const startTime = endTime - 24 * 60 * 60 * 1000; // 24 hours ago in milliseconds

    let allLogs: any[] = [];
    let lastRowKey = '';
    let hasMore = true;
    let pageCount = 0;

    // Paginate using V2 API to retrieve up to 10 pages (1000 logs max) to cover active sensors
    while (hasMore && pageCount < 10) {
      const rowKeyParam = lastRowKey ? `&last_row_key=${encodeURIComponent(lastRowKey)}` : '';
      
      const res = await makeTuyaRequest(
        `/v2.0/cloud/thing/${deviceId}/report-logs?codes=${tCode},${hCode}&start_time=${startTime}&end_time=${endTime}&size=100${rowKeyParam}`,
        'GET'
      );

      console.log(`[Temp Logs Page ${pageCount}] V2 Raw Response:`, res);

      if (res && res.success === false) {
        console.warn(`Tuya API returned success:false for Temp Logs: ${res.msg}`);
        break;
      }

      const pageLogs = res?.result?.logs || [];
      allLogs = allLogs.concat(pageLogs);
      
      hasMore = res?.result?.has_more || false;
      lastRowKey = res?.result?.last_row_key || '';
      pageCount++;

      if (pageLogs.length === 0 || !lastRowKey) {
        break;
      }
    }

    if (allLogs.length === 0) return [];
    const logs = allLogs;

    // Group logs into hourly buckets in chronological order (from 23 hours ago to current hour)
    const now = new Date();
    const buckets: { hourStr: string; startMs: number; endMs: number; temps: number[]; hums: number[] }[] = [];
    
    for (let i = 23; i >= 0; i--) {
      const d = new Date(now.getTime() - i * 60 * 60 * 1000);
      const hourStr = `${d.getHours().toString().padStart(2, '0')}:00`;
      const startMs = new Date(d.getFullYear(), d.getMonth(), d.getDate(), d.getHours(), 0, 0, 0).getTime();
      const endMs = startMs + 60 * 60 * 1000;
      buckets.push({ hourStr, startMs, endMs, temps: [], hums: [] });
    }

    // Response logs contain event_time in milliseconds (13 digits)
    logs.forEach((log: any) => {
      const eventMs = Number(log.event_time);
      const bucket = buckets.find(b => eventMs >= b.startMs && eventMs < b.endMs);
      if (bucket) {
        if (log.code === tCode) {
          bucket.temps.push(scaleTemp(log.value));
        } else if (log.code === hCode) {
          bucket.hums.push(scaleHumidity(log.value));
        }
      }
    });

    return buckets.map(b => ({
      time: b.hourStr,
      temp: b.temps.length > 0 
        ? Number((b.temps.reduce((a, b) => a + b, 0) / b.temps.length).toFixed(1))
        : 0,
      humidity: b.hums.length > 0 
        ? Math.round(b.hums.reduce((a, b) => a + b, 0) / b.hums.length)
        : 0
    }));
  } catch (error) {
    console.error("Error fetching real temperature history:", error);
    return [];
  }
};

// Fetch live temperature sensor data
export const fetchLiveTempSensor = async (
  deviceId: string,
  sensorName: string,
  location: string,
  customCodes: { tempCode?: string; humCode?: string }
): Promise<TempSensor | null> => {
  if (!deviceId) return null;

  const tCode = customCodes.tempCode || 'va_temperature';
  const hCode = customCodes.humCode || 'va_humidity';

  try {
    const status = await getDeviceStatus(deviceId);
    
    const tempStatus = status.find(s => s.code === tCode);
    const humStatus = status.find(s => s.code === hCode);
    const batStatus = status.find(s => s.code === 'battery_percentage' || s.code === 'battery');

    const currentTemp = tempStatus ? scaleTemp(tempStatus.value) : 0.0;
    const currentHumidity = humStatus ? scaleHumidity(humStatus.value) : 0;
    const battery = batStatus ? parseTuyaVal(batStatus.value) : 0;

    // Fetch actual real logs
    const history = await fetchRealTempHistory(deviceId, tCode, hCode);

    return {
      id: deviceId,
      name: sensorName,
      location,
      currentTemp,
      currentHumidity,
      status: 'online',
      battery,
      history
    };
  } catch (error) {
    console.error(`Error loading live data for ${sensorName}:`, error);
    return {
      id: deviceId || `sensor-${sensorName.replace(/\s+/g, '-').toLowerCase()}`,
      name: `${sensorName} (Offline)`,
      location,
      currentTemp: 0,
      currentHumidity: 0,
      status: 'offline',
      battery: 0,
      history: []
    };
  }
};

// Query actual 24h power consumption logs from Tuya OpenAPI (paginating using V2 API to ensure we get full 24h of data)
export const fetchRealPowerHistory = async (
  deviceId: string,
  powerCode: string
): Promise<{ time: string; loadWatts: number; voltage: number; currentAmps: number }[]> => {
  try {
    // Tuya logs query expects Unix milliseconds (13 digits)
    const endTime = Date.now();
    const startTime = endTime - 24 * 60 * 60 * 1000; // 24 hours ago in milliseconds

    let allLogs: any[] = [];
    let lastRowKey = '';
    let hasMore = true;
    let pageCount = 0;

    // Paginate using V2 API to retrieve up to 10 pages (1000 logs max)
    while (hasMore && pageCount < 10) {
      const rowKeyParam = lastRowKey ? `&last_row_key=${encodeURIComponent(lastRowKey)}` : '';
      
      const res = await makeTuyaRequest(
        `/v2.0/cloud/thing/${deviceId}/report-logs?codes=${powerCode}&start_time=${startTime}&end_time=${endTime}&size=100${rowKeyParam}`,
        'GET'
      );

      if (res && res.success === false) {
        console.warn(`Tuya API returned success:false for Power Logs: ${res.msg}`);
        break;
      }

      const pageLogs = res?.result?.logs || [];
      allLogs = allLogs.concat(pageLogs);
      
      hasMore = res?.result?.has_more || false;
      lastRowKey = res?.result?.last_row_key || '';
      pageCount++;

      if (pageLogs.length === 0 || !lastRowKey) {
        break;
      }
    }

    if (allLogs.length === 0) return [];
    const pLogs = allLogs;

    // Group logs into hourly buckets in chronological order (from 23 hours ago to current hour)
    const now = new Date();
    const buckets: { hourStr: string; startMs: number; endMs: number; loads: number[] }[] = [];
    
    for (let i = 23; i >= 0; i--) {
      const d = new Date(now.getTime() - i * 60 * 60 * 1000);
      const hourStr = `${d.getHours().toString().padStart(2, '0')}:00`;
      const startMs = new Date(d.getFullYear(), d.getMonth(), d.getDate(), d.getHours(), 0, 0, 0).getTime();
      const endMs = startMs + 60 * 60 * 1000;
      buckets.push({ hourStr, startMs, endMs, loads: [] });
    }

    pLogs.forEach((log: any) => {
      const eventMs = Number(log.event_time);
      const bucket = buckets.find(b => eventMs >= b.startMs && eventMs < b.endMs);
      if (bucket) {
        bucket.loads.push(Math.round(scalePower(log.value)));
      }
    });

    return buckets.map(b => {
      const avgLoad = b.loads.length > 0 
        ? Math.round(b.loads.reduce((a, b) => a + b, 0) / b.loads.length)
        : 0;

      return {
        time: b.hourStr,
        loadWatts: avgLoad,
        voltage: avgLoad > 0 ? 230 : 0,
        currentAmps: avgLoad > 0 ? Number((avgLoad / 230).toFixed(2)) : 0
      };
    });
  } catch (error) {
    console.error("Error fetching real power history:", error);
    return [];
  }
};

// Fetch daily energy statistics from Firestore (populated by GitHub Actions)
export const fetchRealDailyPowerStats = async (
  _deviceId: string,
  _energyCode: string
): Promise<{ date: string; kwh: number; peakKw: number; cost: number; hourly?: number[] }[]> => {
  try {
    const user = auth.currentUser;
    if (!user) return [];
    return await fetchFirestoreDailyPowerStats(user.uid);
  } catch (error) {
    console.error("Error loading daily stats from Firestore:", error);
    return [];
  }
};

// Fetch daily climate statistics from Firestore (populated by GitHub Actions)
export const fetchRealDailyClimateStats = async (): Promise<{ date: string; sensors: any }[]> => {
  try {
    const user = auth.currentUser;
    if (!user) return [];
    return await fetchFirestoreDailyClimateStats(user.uid);
  } catch (error) {
    console.error("Error loading daily climate stats from Firestore:", error);
    return [];
  }
};

// Fetch single day power stats from Firestore
export const fetchRealDayPowerStats = async (date: string): Promise<any | null> => {
  try {
    const user = auth.currentUser;
    if (!user) return null;
    return await fetchFirestoreDayPowerStats(user.uid, date);
  } catch (error) {
    console.error("Error loading single day power stats:", error);
    return null;
  }
};

// Fetch single day climate stats from Firestore
export const fetchRealDayClimateStats = async (date: string): Promise<any | null> => {
  try {
    const user = auth.currentUser;
    if (!user) return null;
    return await fetchFirestoreDayClimateStats(user.uid, date);
  } catch (error) {
    console.error("Error loading single day climate stats:", error);
    return null;
  }
};


// Fetch live power meter statistics
export const fetchLivePowerMeter = async (
  deviceId: string,
  meterName: string,
  customCodes: { 
    powerCode?: string; 
    voltageCode?: string; 
    currentCode?: string; 
    energyCode?: string; 
  }
): Promise<PowerMeter | null> => {
  if (!deviceId) return null;

  const pCode = customCodes.powerCode || 'cur_power';
  const vCode = customCodes.voltageCode || 'cur_voltage';
  const iCode = customCodes.currentCode || 'cur_current';
  const eCode = customCodes.energyCode || 'add_ele';

  try {
    const status = await getDeviceStatus(deviceId);
    console.log("Raw Power Meter Status:", status);

    const powerStatus = status.find(s => s.code === pCode);
    const voltStatus = status.find(s => s.code === vCode);
    const currStatus = status.find(s => s.code === iCode);
    const energyStatus = status.find(s => s.code === eCode);

    const currentLoad = powerStatus ? Number(scalePower(powerStatus.value).toFixed(1)) : 0;
    const voltage = voltStatus ? Number(scaleVoltage(voltStatus.value).toFixed(1)) : 0;
    const currentAmps = currStatus ? Number(scaleCurrent(currStatus.value).toFixed(2)) : 0;
    // Calculate today's total kWh by summing add_ele logs from midnight to now
    let todayKwh = 0;
    try {
      const now = new Date();
      const midnight = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
      const nowTime = now.getTime();
      
      const energyLogsRes = await makeTuyaRequest(
        `/v2.0/cloud/thing/${deviceId}/report-logs?codes=${eCode}&start_time=${midnight}&end_time=${nowTime}&size=100`,
        'GET'
      );
      
      if (energyLogsRes && energyLogsRes.success) {
        const logs = energyLogsRes.result?.logs || [];
        const sumRaw = logs.reduce((acc: number, log: any) => acc + (Number(log.value) || 0), 0);
        todayKwh = Number((sumRaw / 1000).toFixed(2));
      }
    } catch (err) {
      console.warn("Failed to calculate live todayKwh from logs, falling back to instant DP:", err);
    }

    if (todayKwh === 0) {
      const todayKwhRaw = energyStatus ? Number(energyStatus.value) || 0 : 0;
      todayKwh = Number((todayKwhRaw / 1000).toFixed(2));
    }

    // Fetch actual real logs
    const hourlyHistory = await fetchRealPowerHistory(deviceId, pCode);
    const dailyHistory = await fetchRealDailyPowerStats(deviceId, eCode);

    const weekKwh = Number(dailyHistory.slice(-7).reduce((acc, d) => acc + d.kwh, 0).toFixed(1));
    const monthKwh = Number(dailyHistory.reduce((acc, d) => acc + d.kwh, 0).toFixed(1)) || todayKwh;
    const estMonthlyCost = Number((monthKwh * 0.15).toFixed(2));

    const breakdown: any[] = [
      { name: 'Heating & Cooling', percentage: 38, kwh: Number((monthKwh * 0.38).toFixed(1)), color: 'var(--color-primary)' },
      { name: 'Major Appliances', percentage: 27, kwh: Number((monthKwh * 0.27).toFixed(1)), color: 'var(--color-secondary)' },
      { name: 'Lighting & Smart Devices', percentage: 19, kwh: Number((monthKwh * 0.19).toFixed(1)), color: 'var(--color-accent)' },
      { name: 'Standby / Other Devices', percentage: 16, kwh: Number((monthKwh * 0.16).toFixed(1)), color: 'var(--color-warning)' }
    ];

    return {
      id: deviceId,
      name: meterName,
      currentLoad,
      voltage,
      currentAmps,
      todayKwh,
      weekKwh,
      monthKwh,
      estMonthlyCost,
      hourlyHistory,
      dailyHistory,
      breakdown
    };
  } catch (error) {
    console.error(`Error loading live data for ${meterName}:`, error);
    return {
      id: deviceId,
      name: meterName,
      currentLoad: 0,
      voltage: 0,
      currentAmps: 0,
      todayKwh: 0,
      weekKwh: 0,
      monthKwh: 0,
      estMonthlyCost: 0,
      hourlyHistory: [],
      dailyHistory: [],
      breakdown: []
    };
  }
};

export interface InstantPowerStats {
  currentLoad: number;
  voltage: number;
  currentAmps: number;
}

// Fetch lightweight real-time stats (Active power, voltage, and current draw)
export const fetchInstantPowerStats = async (
  deviceId: string,
  customCodes: { 
    powerCode?: string; 
    voltageCode?: string; 
    currentCode?: string; 
  }
): Promise<InstantPowerStats | null> => {
  if (!deviceId) return null;

  const pCode = customCodes.powerCode || 'cur_power';
  const vCode = customCodes.voltageCode || 'cur_voltage';
  const iCode = customCodes.currentCode || 'cur_current';

  try {
    const status = await getDeviceStatus(deviceId);

    const powerStatus = status.find(s => s.code === pCode);
    const voltStatus = status.find(s => s.code === vCode);
    const currStatus = status.find(s => s.code === iCode);

    const currentLoad = powerStatus ? Number(scalePower(powerStatus.value).toFixed(1)) : 0;
    const voltage = voltStatus ? Number(scaleVoltage(voltStatus.value).toFixed(1)) : 0;
    const currentAmps = currStatus ? Number(scaleCurrent(currStatus.value).toFixed(2)) : 0;

    return {
      currentLoad,
      voltage,
      currentAmps
    };
  } catch (err) {
    console.error("Error fetching instant power stats:", err);
    return null;
  }
};

// Orchestrator: load all devices depending on mode (no simulated demo mode fallbacks)
export const fetchAllDeviceData = async (): Promise<{
  mode: 'live' | 'demo';
  sensors: TempSensor[];
  power: PowerMeter | null;
}> => {
  const live = await isLiveMode();
  if (!live) {
    return {
      mode: 'live',
      sensors: [],
      power: null
    };
  }

  const config = (await getTuyaConfig())!;
  
  const sensorsPromises: Promise<TempSensor | null>[] = [];
  if (config.tempDeviceId1) {
    sensorsPromises.push(
      fetchLiveTempSensor(config.tempDeviceId1, config.tempName1 || 'Living Room Sensor', config.tempLoc1 || 'Main Floor', {
        tempCode: config.tempCode1,
        humCode: config.humCode1
      })
    );
  }
  if (config.tempDeviceId2) {
    sensorsPromises.push(
      fetchLiveTempSensor(config.tempDeviceId2, config.tempName2 || 'Greenhouse Sensor', config.tempLoc2 || 'Backyard Garden', {
        tempCode: config.tempCode2,
        humCode: config.humCode2
      })
    );
  }

  let power: PowerMeter | null = null;
  if (config.powerDeviceId) {
    power = await fetchLivePowerMeter(config.powerDeviceId, config.powerName || 'Main Grid Meter', {
      powerCode: config.powerCode,
      voltageCode: config.voltageCode,
      currentCode: config.currentCode,
      energyCode: config.energyCode
    });
  }

  const allSensorsRaw = await Promise.all(sensorsPromises);
  const sensors = allSensorsRaw.filter((s): s is TempSensor => s !== null);

  return {
    mode: 'live',
    sensors,
    power
  };
};
