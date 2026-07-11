import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { fetchAllDeviceData } from '../utils/deviceBridge';
import type { TempSensor, PowerMeter } from '../utils/mockData';
import { LineAreaChart } from '../components/CustomChart';
import { 
  Thermometer, 
  Droplets, 
  Battery, 
  Zap, 
  AlertTriangle,
  ArrowRight,
  ShieldCheck,
  CheckCircle2
} from 'lucide-react';

export const Dashboard: React.FC = () => {
  const navigate = useNavigate();
  const [sensors, setSensors] = useState<TempSensor[]>([]);
  const [powerData, setPowerData] = useState<PowerMeter | null>(null);
  const [mode, setMode] = useState<'demo' | 'live'>('demo');

  // Initialize data
  useEffect(() => {
    const loadData = async () => {
      const data = await fetchAllDeviceData();
      setSensors(data.sensors);
      setPowerData(data.power);
      setMode(data.mode);
    };
    loadData();
  }, []);

  // Fluctuate data slightly to simulate real-time sensor streams
  useEffect(() => {
    if (sensors.length === 0 || !powerData) return;

    const interval = setInterval(() => {
      // Fluctuate temperature sensors
      setSensors(prevSensors => 
        prevSensors.map(sensor => {
          const tempDelta = (Math.random() - 0.5) * 0.2;
          const humDelta = Math.random() > 0.7 ? (Math.random() > 0.5 ? 1 : -1) : 0;
          
          const newTemp = Number((sensor.currentTemp + tempDelta).toFixed(1));
          const newHum = Math.min(100, Math.max(0, sensor.currentHumidity + humDelta));
          
          // Also update the last element of history to match
          const newHistory = [...sensor.history];
          if (newHistory.length > 0) {
            const lastIdx = newHistory.length - 1;
            newHistory[lastIdx] = {
              ...newHistory[lastIdx],
              temp: newTemp,
              humidity: newHum
            };
          }

          return {
            ...sensor,
            currentTemp: newTemp,
            currentHumidity: newHum,
            history: newHistory
          };
        })
      );

      // Fluctuate power meter load
      setPowerData(prevPower => {
        if (!prevPower) return null;
        const loadDelta = Math.round((Math.random() - 0.5) * 40); // +/- 20 Watts
        const newLoad = Math.max(80, prevPower.currentLoad + loadDelta);
        const voltDelta = Number(((Math.random() - 0.5) * 0.4).toFixed(1));
        const newVolt = Number((prevPower.voltage + voltDelta).toFixed(1));
        const newAmps = Number((newLoad / newVolt).toFixed(2));

        const newHourly = [...prevPower.hourlyHistory];
        if (newHourly.length > 0) {
          const lastIdx = newHourly.length - 1;
          newHourly[lastIdx] = {
            ...newHourly[lastIdx],
            loadWatts: newLoad,
            voltage: newVolt,
            currentAmps: newAmps
          };
        }

        return {
          ...prevPower,
          currentLoad: newLoad,
          voltage: newVolt,
          currentAmps: newAmps,
          hourlyHistory: newHourly
        };
      });
    }, 4000);

    return () => clearInterval(interval);
  }, [sensors.length, powerData]);

  if (sensors.length === 0 || !powerData) {
    return (
      <div className="loading-screen">
        <Zap className="animate-spin text-primary" size={48} />
        <p>Connecting to smart devices...</p>
      </div>
    );
  }

  // Calculate live online device count
  const onlineDevicesCount = sensors.filter(s => s.status === 'online').length + 
                             (powerData.name.includes('Offline') ? 0 : 1);

  // Get greenhouse alerts
  const greenhouse = sensors.find(s => s.id === 'temp-greenhouse');
  const showGreenhouseAlert = greenhouse && greenhouse.currentTemp > 29.5;

  // Calculate battery levels color
  const getBatteryColor = (level: number) => {
    if (level < 20) return 'text-danger';
    if (level < 50) return 'text-warning';
    return 'text-success';
  };

  return (
    <div className="dashboard-view animate-fade-in">
      {mode === 'demo' && (
        <div className="alert-banner warning" style={{ marginBottom: '24px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <AlertTriangle size={18} />
            <span><strong>Demo Mode:</strong> Displaying simulated metrics. Configure your credentials in Settings to sync your real devices.</span>
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
      {/* Overview Banner / Hero section */}
      <section className="overview-hero glass" aria-label="System Quick Summary">
        <div className="hero-welcome">
          <h2>Welcome Back</h2>
          <p>Here is what's happening in your connected home today.</p>
        </div>
        <div className="hero-stats">
          <div className="hero-stat-card">
            <div className="stat-icon-wrapper primary">
              <Zap size={20} />
            </div>
            <div>
              <span className="stat-label">Total Grid Load</span>
              <span className="stat-value">{powerData.currentLoad.toLocaleString()} W</span>
            </div>
          </div>
          <div className="hero-stat-card">
            <div className="stat-icon-wrapper success">
              <CheckCircle2 size={20} />
            </div>
            <div>
              <span className="stat-label">Device Status</span>
              <span className="stat-value">{onlineDevicesCount} Online</span>
            </div>
          </div>
        </div>
      </section>

      {/* Grid Layout: Power Widget vs Temperature Sensors */}
      <div className="dashboard-grid">
        
        {/* Power Meter Quick Stat Widget */}
        <section className="dashboard-card power-widget glass" aria-labelledby="power-widget-title">
          <div className="card-header">
            <div className="card-title-group">
              <Zap className="card-icon text-accent" />
              <h3 id="power-widget-title">Active Power Consumption</h3>
            </div>
            <button 
              id="view-detailed-power-btn"
              onClick={() => navigate('/power')} 
              className="card-action-btn"
              title="View full statistics"
            >
              <span>Full Stats</span>
              <ArrowRight size={14} />
            </button>
          </div>

          <div className="power-realtime-grid">
            <div className="realtime-dial">
              <span className="dial-value">{powerData.currentLoad}</span>
              <span className="dial-unit">WATTS</span>
              <span className="dial-label">Active Load</span>
            </div>

            <div className="realtime-metrics">
              <div className="metric-row">
                <span className="metric-name">Today's Usage</span>
                <span className="metric-val">{powerData.todayKwh} kWh</span>
              </div>
              <div className="metric-row">
                <span className="metric-name">Voltage</span>
                <span className="metric-val">{powerData.voltage} V</span>
              </div>
              <div className="metric-row">
                <span className="metric-name">Current Draw</span>
                <span className="metric-val">{powerData.currentAmps} A</span>
              </div>
              <div className="metric-row">
                <span className="metric-name">Est. Cost (Month)</span>
                <span className="metric-val">${powerData.estMonthlyCost.toFixed(2)}</span>
              </div>
            </div>
          </div>

          <div className="widget-chart-section">
            <h4>24-Hour Load Profile (Watts)</h4>
            <div className="chart-wrapper">
              <LineAreaChart 
                data={powerData.hourlyHistory} 
                xKey="time" 
                yKey="loadWatts"
                yLabel="Load"
                color="var(--color-accent)"
                fillColor="url(#gradient-cyan)"
                height={160}
                valueSuffix="W"
                showMinMax={false}
              />
            </div>
          </div>
        </section>

        {/* Temperature and Climate Monitors */}
        <section className="dashboard-card temperature-widget glass" aria-labelledby="climate-widget-title">
          <div className="card-header">
            <div className="card-title-group">
              <Thermometer className="card-icon text-primary" />
              <h3 id="climate-widget-title">Climate Monitors</h3>
            </div>
          </div>

          {showGreenhouseAlert && (
            <div className="alert-banner warning animate-pulse" id="greenhouse-alert-banner">
              <AlertTriangle size={18} />
              <span><strong>Greenhouse Alert:</strong> Temperature exceeds optimal threshold! (29.5°C)</span>
            </div>
          )}

          <div className="sensors-vertical-list">
            {sensors.map((sensor) => {
              const isGreenhouse = sensor.id === 'temp-greenhouse';
              
              // Comfort index helpers
              let comfortStatus = 'Optimal';
              let comfortClass = 'success';
              if (sensor.currentHumidity > 70) {
                comfortStatus = isGreenhouse ? 'Humid (Normal)' : 'High Humidity';
                comfortClass = isGreenhouse ? 'success' : 'warning';
              } else if (sensor.currentTemp > 27) {
                comfortStatus = 'Warm';
                comfortClass = 'warning';
              }

              return (
                <div key={sensor.id} className="sensor-detail-item">
                  <div className="sensor-meta-row">
                    <div>
                      <h4 className="sensor-name">{sensor.name}</h4>
                      <span className="sensor-location">{sensor.location}</span>
                    </div>
                    <div className="sensor-badges">
                      <span className={`comfort-badge ${comfortClass}`}>
                        {comfortStatus}
                      </span>
                      <span className="battery-badge">
                        <Battery size={13} className={getBatteryColor(sensor.battery)} />
                        <span>{sensor.battery}%</span>
                      </span>
                    </div>
                  </div>

                  <div className="sensor-readings-row">
                    <div className="reading-block">
                      <Thermometer size={18} className="text-primary" />
                      <div>
                        <span className="reading-value">{sensor.currentTemp.toFixed(1)}°C</span>
                        <span className="reading-label">Temperature</span>
                      </div>
                    </div>

                    <div className="reading-block">
                      <Droplets size={18} className="text-secondary" />
                      <div>
                        <span className="reading-value">{sensor.currentHumidity}%</span>
                        <span className="reading-label">Humidity</span>
                      </div>
                    </div>
                  </div>

                  <div className="sensor-sparkline">
                    <span className="sparkline-title">24-Hour Temperature Wave</span>
                    <div className="chart-wrapper mini">
                      <LineAreaChart 
                        data={sensor.history} 
                        xKey="time" 
                        yKey="temp" 
                        yLabel="Temp"
                        color={isGreenhouse ? 'var(--color-warning)' : 'var(--color-primary)'}
                        fillColor={isGreenhouse ? 'url(#gradient-amber)' : 'url(#gradient-indigo)'}
                        height={100}
                        valueSuffix="°C"
                        showMinMax={false}
                      />
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </section>
      </div>

      {/* Grid: Carbon Footprint & Quick Tips */}
      <div className="dashboard-secondary-grid">
        <section className="dashboard-card info-card glass" aria-labelledby="energy-tip-title">
          <div className="card-header">
            <div className="card-title-group">
              <ShieldCheck className="card-icon text-success" />
              <h3 id="energy-tip-title">Smart Efficiency Coach</h3>
            </div>
          </div>
          <div className="tips-content">
            <p>Your standby load is currently <strong>{Math.round(powerData.currentLoad * 0.08)} Watts</strong> (about 8% of your average load).</p>
            <ul className="tips-list">
              <li>💡 Turn off large media systems when sleeping to save ~45W standby power.</li>
              <li>🌡️ Greenhouse temperature is climbing. Consider venting it to prevent overheating.</li>
              <li>🔋 Living Room sensor battery is at 88% - no action required for ~6 months.</li>
            </ul>
          </div>
        </section>
      </div>
    </div>
  );
};
