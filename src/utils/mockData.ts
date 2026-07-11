export interface TempReading {
  time: string;
  temp: number;
  humidity: number;
}

export interface TempSensor {
  id: string;
  name: string;
  location: string;
  currentTemp: number;
  currentHumidity: number;
  status: 'online' | 'offline';
  battery: number;
  history: TempReading[];
}

export interface HourlyPowerReading {
  time: string;
  loadWatts: number;
  voltage: number;
  currentAmps: number;
}

export interface DailyPowerReading {
  date: string;
  kwh: number;
  peakKw: number;
  cost: number;
}

export interface DevicePowerBreakdown {
  name: string;
  percentage: number;
  kwh: number;
  color: string;
}

export interface PowerMeter {
  id: string;
  name: string;
  currentLoad: number; // Watts
  voltage: number;     // Volts
  currentAmps: number; // Amps
  todayKwh: number;
  weekKwh: number;
  monthKwh: number;
  estMonthlyCost: number;
  hourlyHistory: HourlyPowerReading[];
  dailyHistory: DailyPowerReading[];
  breakdown: DevicePowerBreakdown[];
}

// Helper to generate 24-hour readings
const generate24HourTempHistory = (baseTemp: number, variance: number, baseHum: number, humVariance: number): TempReading[] => {
  const history: TempReading[] = [];
  const now = new Date();
  
  for (let i = 23; i >= 0; i--) {
    const d = new Date(now.getTime() - i * 60 * 60 * 1000);
    const hour = d.getHours();
    
    // Create a diurnal curve (cooler at night, warmer in afternoon)
    const hourRad = ((hour - 6) / 24) * 2 * Math.PI;
    const tempFactor = -Math.cos(hourRad); // -1 at 6am, +1 at 6pm (roughly)
    
    const temp = Number((baseTemp + tempFactor * variance + (Math.random() - 0.5) * 0.8).toFixed(1));
    const humidity = Math.min(100, Math.max(0, Math.round(baseHum - tempFactor * humVariance + (Math.random() - 0.5) * 5)));
    
    history.push({
      time: `${hour.toString().padStart(2, '0')}:00`,
      temp,
      humidity
    });
  }
  return history;
};

const generate24HourPowerHistory = (): HourlyPowerReading[] => {
  const history: HourlyPowerReading[] = [];
  const now = new Date();
  
  // Power profiles usually peak in the morning (7-9 AM) and evening (6-9 PM)
  for (let i = 23; i >= 0; i--) {
    const d = new Date(now.getTime() - i * 60 * 60 * 1000);
    const hour = d.getHours();
    
    let baseLoad = 300; // Always-on idle load
    
    // Morning peak
    if (hour >= 7 && hour <= 9) {
      baseLoad += 1200 + Math.random() * 800;
    }
    // Mid day standard activity
    else if (hour > 9 && hour < 17) {
      baseLoad += 400 + Math.random() * 400;
    }
    // Evening peak (dinner, TV, heating/AC)
    else if (hour >= 17 && hour <= 21) {
      baseLoad += 1800 + Math.random() * 1200;
    }
    // Late night
    else if (hour > 21 || hour < 7) {
      baseLoad += Math.random() * 150;
    }
    
    const voltage = Number((230 + (Math.random() - 0.5) * 4).toFixed(1));
    const currentAmps = Number((baseLoad / voltage).toFixed(2));
    
    history.push({
      time: `${hour.toString().padStart(2, '0')}:00`,
      loadWatts: Math.round(baseLoad),
      voltage,
      currentAmps
    });
  }
  return history;
};

const generate30DayPowerHistory = (): DailyPowerReading[] => {
  const history: DailyPowerReading[] = [];
  const now = new Date();
  
  for (let i = 29; i >= 0; i--) {
    const d = new Date(now.getTime() - i * 24 * 60 * 60 * 1000);
    const isWeekend = d.getDay() === 0 || d.getDay() === 6;
    
    // Weekends usually have higher power usage
    const baseEnergy = isWeekend ? 18 + Math.random() * 6 : 12 + Math.random() * 4;
    const peakKw = Number((baseEnergy / 4 + Math.random() * 1.5).toFixed(2));
    const cost = Number((baseEnergy * 0.15).toFixed(2)); // $0.15 per kWh
    
    const dateStr = d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
    
    history.push({
      date: dateStr,
      kwh: Number(baseEnergy.toFixed(1)),
      peakKw,
      cost
    });
  }
  return history;
};

// Generate fixed sensors and power meter datasets
export const getTempSensors = (): TempSensor[] => [
  {
    id: 'temp-living-room',
    name: 'Living Room Sensor',
    location: 'Main Floor',
    currentTemp: 22.4,
    currentHumidity: 45,
    status: 'online',
    battery: 88,
    history: generate24HourTempHistory(22.0, 1.5, 45, 5)
  },
  {
    id: 'temp-greenhouse',
    name: 'Greenhouse Sensor',
    location: 'Backyard Garden',
    currentTemp: 28.1,
    currentHumidity: 78,
    status: 'online',
    battery: 64,
    history: generate24HourTempHistory(26.0, 6.0, 75, 12)
  }
];

export const getPowerMeterData = (): PowerMeter => {
  const hourly = generate24HourPowerHistory();
  const daily = generate30DayPowerHistory();
  
  const todayKwh = Number(daily[daily.length - 1].kwh.toFixed(1));
  const weekKwh = Number(daily.slice(-7).reduce((acc, curr) => acc + curr.kwh, 0).toFixed(1));
  const monthKwh = Number(daily.reduce((acc, curr) => acc + curr.kwh, 0).toFixed(1));
  const estMonthlyCost = Number((monthKwh * 0.15).toFixed(2));
  
  const currentHourly = hourly[hourly.length - 1];

  const breakdown: DevicePowerBreakdown[] = [
    { name: 'Climate Control (HVAC)', percentage: 42, kwh: Number((monthKwh * 0.42).toFixed(1)), color: 'var(--color-primary)' },
    { name: 'Large Appliances', percentage: 24, kwh: Number((monthKwh * 0.24).toFixed(1)), color: 'var(--color-secondary)' },
    { name: 'Lighting & Electronics', percentage: 15, kwh: Number((monthKwh * 0.15).toFixed(1)), color: 'var(--color-accent)' },
    { name: 'Water Heater', percentage: 11, kwh: Number((monthKwh * 0.11).toFixed(1)), color: 'var(--color-warning)' },
    { name: 'Always-On / Idle', percentage: 8, kwh: Number((monthKwh * 0.08).toFixed(1)), color: 'var(--color-success)' }
  ];

  return {
    id: 'power-meter-main',
    name: 'Main Smart Meter',
    currentLoad: currentHourly.loadWatts,
    voltage: currentHourly.voltage,
    currentAmps: currentHourly.currentAmps,
    todayKwh,
    weekKwh,
    monthKwh,
    estMonthlyCost,
    hourlyHistory: hourly,
    dailyHistory: daily,
    breakdown
  };
};
