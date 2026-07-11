import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { fetchAllDeviceData, fetchRealDailyClimateStats } from '../utils/deviceBridge';
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

export const PowerDetails: React.FC = () => {
  const navigate = useNavigate();
  const [powerData, setPowerData] = useState<PowerMeter | null>(null);
  const [sensors, setSensors] = useState<TempSensor[]>([]);
  const [climateHistory, setClimateHistory] = useState<{ date: string; sensors: any }[]>([]);
  const [timeRange, setTimeRange] = useState<'24h' | '30d'>('24h');
  const [selectedSensorKey, setSelectedSensorKey] = useState<string>('sensor1');
  const [climateMetric, setClimateMetric] = useState<'temp' | 'humidity'>('temp');
  const [mode, setMode] = useState<'demo' | 'live'>('demo');
  const [loading, setLoading] = useState(true);

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

  // 1. Process Power History Chart Data
  const powerDailyData = powerData
    ? powerData.dailyHistory.map(d => ({
        ...d,
        date: formatChartDate(d.date)
      }))
    : [];

  // 2. Resolve Selected Climate Sensor
  const selectedSensor = sensors.find(s => {
    if (selectedSensorKey === 'sensor1') return s.id === (sensors[0]?.id);
    if (selectedSensorKey === 'sensor2') return s.id === (sensors[1]?.id);
    return false;
  }) || (selectedSensorKey === 'sensor1' ? sensors[0] : sensors[1]);

  // 3. Process Climate History Chart Data
  const climateDailyData = climateHistory.map(entry => {
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

  if (timeRange === '24h') {
    const temps = selectedSensor?.history.map(h => h.temp) || [];
    const hums = selectedSensor?.history.map(h => h.humidity) || [];
    avgTemp = temps.length > 0 ? Number((temps.reduce((a, b) => a + b, 0) / temps.length).toFixed(1)) : 0;
    minTemp = temps.length > 0 ? Math.min(...temps) : 0;
    maxTemp = temps.length > 0 ? Math.max(...temps) : 0;
    avgHum = hums.length > 0 ? Math.round(hums.reduce((a, b) => a + b, 0) / hums.length) : 0;
    minHum = hums.length > 0 ? Math.min(...hums) : 0;
    maxHum = hums.length > 0 ? Math.max(...hums) : 0;
  } else {
    const dailyTemps = climateHistory.map(entry => entry.sensors[selectedSensorKey]?.avgTemp).filter((t): t is number => t !== undefined);
    const dailyMins = climateHistory.map(entry => entry.sensors[selectedSensorKey]?.minTemp).filter((t): t is number => t !== undefined);
    const dailyMaxs = climateHistory.map(entry => entry.sensors[selectedSensorKey]?.maxTemp).filter((t): t is number => t !== undefined);
    const dailyHums = climateHistory.map(entry => entry.sensors[selectedSensorKey]?.avgHumidity).filter((h): h is number => h !== undefined);

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
      <section className="page-header" aria-label="Page Title">
        <div className="title-group">
          <h2>Power & Climate Analytics</h2>
          <p>Detailed insight into your grid connection, energy consumption, and environmental climate history.</p>
        </div>
        <div className="tab-control glass">
          <button 
            id="tab-range-24h"
            className={`tab-btn ${timeRange === '24h' ? 'active' : ''}`}
            onClick={() => setTimeRange('24h')}
          >
            <Clock size={14} />
            <span>24h Profile</span>
          </button>
          <button 
            id="tab-range-30d"
            className={`tab-btn ${timeRange === '30d' ? 'active' : ''}`}
            onClick={() => setTimeRange('30d')}
          >
            <Calendar size={14} />
            <span>30-Day History</span>
          </button>
        </div>
      </section>

      {/* KPI Cards Grid */}
      {powerData && (
        <section className="stats-kpi-grid" aria-label="Power Meter Key Statistics" style={{ marginBottom: '24px' }}>
          <div className="kpi-card glass">
            <div className="kpi-header">
              <Zap className="kpi-icon text-accent" />
              <span className="kpi-title">Current Realtime Load</span>
            </div>
            <div className="kpi-value">{powerData.currentLoad.toLocaleString()} W</div>
            <div className="kpi-footer">
              <span className="text-muted">Grid Voltage: {powerData.voltage} V</span>
            </div>
          </div>

          <div className="kpi-card glass">
            <div className="kpi-header">
              <TrendingUp className="kpi-icon text-success" />
              <span className="kpi-title">Today's Energy Use</span>
            </div>
            <div className="kpi-value">{powerData.todayKwh} kWh</div>
            <div className="kpi-footer">
              <span className="text-muted">CO₂ Footprint: {(powerData.todayKwh * 0.385).toFixed(2)} kg</span>
            </div>
          </div>

          <div className="kpi-card glass">
            <div className="kpi-header">
              <Calendar className="kpi-icon text-primary" />
              <span className="kpi-title">Monthly Energy Total</span>
            </div>
            <div className="kpi-value">{powerData.monthKwh} kWh</div>
            <div className="kpi-footer">
              <span className="text-muted">Weekly Avg: {(powerData.weekKwh / 7).toFixed(1)} kWh/day</span>
            </div>
          </div>

          <div className="kpi-card glass">
            <div className="kpi-header">
              <DollarSign className="kpi-icon text-warning" />
              <span className="kpi-title">Est. Monthly Cost</span>
            </div>
            <div className="kpi-value">${powerData.estMonthlyCost.toFixed(2)}</div>
            <div className="kpi-footer">
              <span className="text-muted">Rate Plan: Flat $0.15/kWh</span>
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
                {timeRange === '24h' ? '24-Hour Load Curve (Active Power)' : '30-Day Energy Consumption (kWh)'}
              </h3>
            </div>
          </div>
          <div className="chart-main-body">
            {timeRange === '24h' ? (
              <LineAreaChart 
                data={powerData.hourlyHistory} 
                xKey="time" 
                yKey="loadWatts"
                yLabel="Active Load"
                color="var(--color-accent)"
                fillColor="url(#gradient-cyan)"
                height={260}
                valueSuffix=" W"
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
                  ? `${(peakLoad24h / 1000).toFixed(2)} kW` 
                  : `${Math.max(...powerData.dailyHistory.map(d => d.peakKw), 0)} kW`}
              </span>
            </div>
            <div className="summary-stat-item">
              <span className="summary-stat-label">Average Load</span>
              <span className="summary-stat-val">
                {timeRange === '24h' ? `${avgLoad24h} W` : `${(powerData.monthKwh / 30).toFixed(1)} kWh/day`}
              </span>
            </div>
            <div className="summary-stat-item">
              <span className="summary-stat-label">Total Cost</span>
              <span className="summary-stat-val text-warning">
                {timeRange === '24h' ? `$${(powerData.todayKwh * 0.15).toFixed(2)} (Today)` : `$${powerData.estMonthlyCost.toFixed(2)}`}
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
                ? `24-Hour Climate Profile: ${selectedSensor?.name || 'Sensor'}`
                : `30-Day Climate History: ${selectedSensor?.name || 'Sensor'}`}
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
          {timeRange === '24h' ? (
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
