import { getDeviceStatus, getTuyaConfig, makeTuyaRequest, auth, fetchFirestoreDailyPowerStats } from './tuyaService';
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
  return num > 10000 ? num / 10 : num;
};

// Standardize Voltage scaling
const scaleVoltage = (val: any): number => {
  const num = Number(val);
  if (isNaN(num)) return 0;
  return num > 1000 ? num / 10 : num;
};

// Standardize Current scaling
const scaleCurrent = (val: any): number => {
  const num = Number(val);
  if (isNaN(num)) return 0;
  if (num > 1000) return num / 1000;
  if (num > 100) return num / 100;
  return num;
};

// Query actual 24h temperature logs from Tuya OpenAPI (using correct parameters: codes, type=7, milliseconds, size=100)
export const fetchRealTempHistory = async (
  deviceId: string,
  tCode: string,
  hCode: string
): Promise<TempReading[]> => {
  try {
    // Tuya logs query expects Unix milliseconds (13 digits)
    const endTime = Date.now();
    const startTime = endTime - 24 * 60 * 60 * 1000; // 24 hours ago in milliseconds

    // Fetch temperature and humidity logs in a single call using type=7 (DP reports)
    const res = await makeTuyaRequest(
      `/v1.0/devices/${deviceId}/logs?codes=${tCode},${hCode}&start_time=${startTime}&end_time=${endTime}&size=100&type=7`,
      'GET'
    );

    if (res && res.success === false) {
      console.warn(`Tuya API returned success:false for Temp Logs: ${res.msg}`);
      return [];
    }

    const logs = res?.result?.logs || [];
    if (logs.length === 0) return [];

    // Group logs into hourly buckets
    const hourlyData: { [hour: string]: { temps: number[]; hums: number[] } } = {};
    const now = new Date();
    for (let i = 23; i >= 0; i--) {
      const d = new Date(now.getTime() - i * 60 * 60 * 1000);
      const hourStr = `${d.getHours().toString().padStart(2, '0')}:00`;
      hourlyData[hourStr] = { temps: [], hums: [] };
    }

    // Response logs contain event_time in milliseconds (13 digits)
    logs.forEach((log: any) => {
      const d = new Date(Number(log.event_time));
      const hourStr = `${d.getHours().toString().padStart(2, '0')}:00`;
      if (hourlyData[hourStr]) {
        if (log.code === tCode) {
          hourlyData[hourStr].temps.push(scaleTemp(log.value));
        } else if (log.code === hCode) {
          hourlyData[hourStr].hums.push(scaleHumidity(log.value));
        }
      }
    });

    return Object.keys(hourlyData).map(hour => {
      const bucket = hourlyData[hour];
      return {
        time: hour,
        temp: bucket.temps.length > 0 
          ? Number((bucket.temps.reduce((a, b) => a + b, 0) / bucket.temps.length).toFixed(1))
          : 0,
        humidity: bucket.hums.length > 0 
          ? Math.round(bucket.hums.reduce((a, b) => a + b, 0) / bucket.hums.length)
          : 0
      };
    });
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

// Query actual 24h power consumption logs from Tuya OpenAPI (using correct parameters: codes, type=7, milliseconds, size=100)
export const fetchRealPowerHistory = async (
  deviceId: string,
  powerCode: string
): Promise<{ time: string; loadWatts: number; voltage: number; currentAmps: number }[]> => {
  try {
    // Tuya logs query expects Unix milliseconds (13 digits)
    const endTime = Date.now();
    const startTime = endTime - 24 * 60 * 60 * 1000; // 24 hours ago in milliseconds

    // Fetch power logs using plural codes parameter with type=7 (DP reports)
    const powerRes = await makeTuyaRequest(
      `/v1.0/devices/${deviceId}/logs?codes=${powerCode}&start_time=${startTime}&end_time=${endTime}&size=100&type=7`,
      'GET'
    );

    if (powerRes && powerRes.success === false) {
      console.warn(`Tuya API returned success:false for Power Logs: ${powerRes.msg}`);
      return [];
    }

    const pLogs = powerRes?.result?.logs || [];
    if (pLogs.length === 0) return [];

    const hourlyData: { [hour: string]: number[] } = {};
    const now = new Date();
    for (let i = 23; i >= 0; i--) {
      const d = new Date(now.getTime() - i * 60 * 60 * 1000);
      const hourStr = `${d.getHours().toString().padStart(2, '0')}:00`;
      hourlyData[hourStr] = [];
    }

    pLogs.forEach((log: any) => {
      const d = new Date(Number(log.event_time));
      const hourStr = `${d.getHours().toString().padStart(2, '0')}:00`;
      if (hourlyData[hourStr]) {
        hourlyData[hourStr].push(Math.round(scalePower(log.value)));
      }
    });

    return Object.keys(hourlyData).map(hour => {
      const loads = hourlyData[hour];
      const avgLoad = loads.length > 0 
        ? Math.round(loads.reduce((a, b) => a + b, 0) / loads.length)
        : 0;

      return {
        time: hour,
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
): Promise<{ date: string; kwh: number; peakKw: number; cost: number }[]> => {
  try {
    const user = auth.currentUser;
    if (!user) return [];
    return await fetchFirestoreDailyPowerStats(user.uid);
  } catch (error) {
    console.error("Error loading daily stats from Firestore:", error);
    return [];
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

    const powerStatus = status.find(s => s.code === pCode);
    const voltStatus = status.find(s => s.code === vCode);
    const currStatus = status.find(s => s.code === iCode);
    const energyStatus = status.find(s => s.code === eCode);

    const currentLoad = powerStatus ? Math.round(scalePower(powerStatus.value)) : 0;
    const voltage = voltStatus ? Number(scaleVoltage(voltStatus.value).toFixed(1)) : 0;
    const currentAmps = currStatus ? Number(scaleCurrent(currStatus.value).toFixed(2)) : 0;
    const todayKwhRaw = energyStatus ? Number(energyStatus.value) || 0 : 0;
    const todayKwh = Number((todayKwhRaw > 1000 ? todayKwhRaw / 1000 : todayKwhRaw / 100).toFixed(2));

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
      fetchLiveTempSensor(config.tempDeviceId1, 'Living Room Sensor', 'Main Floor', {
        tempCode: config.tempCode1,
        humCode: config.humCode1
      })
    );
  }
  if (config.tempDeviceId2) {
    sensorsPromises.push(
      fetchLiveTempSensor(config.tempDeviceId2, 'Greenhouse Sensor', 'Backyard Garden', {
        tempCode: config.tempCode2,
        humCode: config.humCode2
      })
    );
  }

  let power: PowerMeter | null = null;
  if (config.powerDeviceId) {
    power = await fetchLivePowerMeter(config.powerDeviceId, 'Main Grid Meter', {
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
