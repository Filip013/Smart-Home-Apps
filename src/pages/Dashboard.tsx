import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { fetchAllDeviceData, fetchInstantPowerStats } from '../utils/deviceBridge';
import { getCachedTuyaConfig } from '../utils/tuyaService';
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
  CheckCircle2,
  Settings
} from 'lucide-react';

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
  return kwh * 10.66;
};

export const Dashboard: React.FC = () => {
  const navigate = useNavigate();
  const [connStatus, setConnStatus] = useState<{ status: 'local' | 'proxy' | 'cloud' | 'error'; detail?: string }>({ status: 'cloud' });
  const [sensors, setSensors] = useState<TempSensor[]>([]);
  const [powerData, setPowerData] = useState<PowerMeter | null>(null);
  const [mode, setMode] = useState<'demo' | 'live'>('demo');
  const [loading, setLoading] = useState(true);
  const [selectedMetrics, setSelectedMetrics] = useState<{ [sensorId: string]: 'temp' | 'humidity' }>({});

  // Initialize data
  useEffect(() => {
    const loadData = async () => {
      setLoading(true);
      const data = await fetchAllDeviceData();
      setSensors(data.sensors);
      setPowerData(data.power);
      setMode(data.mode);
      setLoading(false);
    };
    loadData();
  }, []);

  // Periodic live data sync from Tuya API (every 30 seconds)
  useEffect(() => {
    if (sensors.length === 0 && !powerData) return;

    const interval = setInterval(async () => {
      try {
        const data = await fetchAllDeviceData();
        setSensors(data.sensors);
        setPowerData(data.power);
      } catch (err) {
        console.error("Error refreshing live data:", err);
      }
    }, 30000); // Sync every 30 seconds

    return () => clearInterval(interval);
  }, [sensors.length, powerData]);

  // Periodic real-time power meter stats sync (Catering to Local TV Box IP vs Tuya Cloud Fallback)
  useEffect(() => {
    if (!powerData || mode !== 'live') return;

    let timeoutId: any = null;
    let isLocalOnline = false;
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
            // Bypass Mixed Content blocking in production (HTTPS) by routing through the CORS proxy (only for unsecure HTTP endpoints)
            if (window.location.protocol === 'https:' && fetchUrl.startsWith('http://') && config.customProxyUrl) {
              const cleanProxy = config.customProxyUrl.trim().endsWith('/') 
                ? config.customProxyUrl.trim().slice(0, -1) 
                : config.customProxyUrl.trim();
              fetchUrl = `${cleanProxy}?url=${encodeURIComponent(fetchUrl)}`;
              isProxied = true;
            }

            const headers: HeadersInit = {};
            if (config.clientSecret) {
              headers['Authorization'] = `Bearer ${config.clientSecret}`;
            }

            const response = await fetch(fetchUrl, { 
              headers,
              signal: AbortSignal.timeout(1000) 
            });
            if (response.ok) {
              const live = await response.json();
              if (live && live.currentLoad !== undefined) {
                setPowerData(prev => prev ? {
                  ...prev,
                  currentLoad: Number(live.currentLoad),
                  voltage: live.voltage !== undefined ? Number(live.voltage) : prev.voltage,
                  currentAmps: live.currentAmps !== undefined ? Number(live.currentAmps) : prev.currentAmps
                } : null);
                isLocalOnline = true;
                setConnStatus({ status: isProxied ? 'proxy' : 'local' });
                return; // Local fetch succeeded, bypass cloud fallback query
              }
            }
            throw new Error(`Server returned HTTP status ${response.status}`);
          } catch (localErr: any) {
            // Local fetch failed (offline or away from home), fallback to cloud
            if (isLocalOnline) {
              console.warn("Local TV Box daemon went offline, falling back to Tuya Cloud:", localErr);
              isLocalOnline = false;
            }
            setConnStatus({ status: 'error', detail: localErr.message || String(localErr) });
          }
        } else {
          setConnStatus({ status: 'cloud', detail: 'Local TV Box IP not configured in Settings' });
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

  if (loading) {
    return (
      <div className="loading-screen" style={{ height: '80vh' }}>
        <Zap className="animate-spin text-primary" size={48} />
        <p style={{ marginTop: '12px' }}>Connecting to smart devices...</p>
      </div>
    );
  }

  // Setup Required View: if no devices are configured
  if (sensors.length === 0 && !powerData) {
    return (
      <div className="settings-view animate-fade-in" style={{ padding: '80px 24px 40px 24px', maxWidth: '600px', margin: '0 auto', textAlign: 'center' }}>
        <section className="dashboard-card glass" style={{ padding: '40px 24px', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '20px' }}>
          <div style={{ width: '56px', height: '56px', borderRadius: '50%', backgroundColor: 'rgba(99, 102, 241, 0.1)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <Settings className="text-primary" size={28} />
          </div>
          <div>
            <h3 style={{ fontSize: '20px', fontWeight: 700, marginBottom: '8px' }}>Smart Dashboard Setup Required</h3>
            <p style={{ fontSize: '14px', color: 'var(--color-text-muted)', lineHeight: '1.6' }}>
              Your smart home dashboard is live, but no devices have been configured yet. Connect your temperature sensors and power meter in the Settings tab to start streaming real-time metrics.
            </p>
          </div>
          <button 
            id="btn-goto-settings-setup"
            onClick={() => navigate('/settings')} 
            className="btn primary" 
            style={{ padding: '10px 24px', fontWeight: 600 }}
          >
            Configure Credentials & Device IDs
          </button>
        </section>
      </div>
    );
  }

  // Calculate live online device count
  const onlineDevicesCount = sensors.filter(s => s.status === 'online').length + 
                             (powerData ? (powerData.name.includes('Offline') ? 0 : 1) : 0);

  // Calculate monthly cost in RSD for Dashboard
  const currentMonth = `${new Date().getFullYear()}-${(new Date().getMonth() + 1).toString().padStart(2, '0')}`;
  const monthlyCostRSD = powerData
    ? (powerData.dailyHistory.filter(d => d.date.startsWith(currentMonth)).length > 0
        ? powerData.dailyHistory
            .filter(d => d.date.startsWith(currentMonth))
            .reduce((acc, d) => acc + calculateDailyCostRSD(d.kwh, d.hourly), 0)
        : powerData.monthKwh * 10.66)
    : 0;

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
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px', flexWrap: 'wrap', marginBottom: '8px' }}>
            <h2 style={{ margin: 0 }}>Welcome Back</h2>
            <div className={`status-badge ${connStatus.status}`} style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '6px',
              fontSize: '11px',
              fontWeight: 600,
              padding: '4px 10px',
              borderRadius: '12px',
              backgroundColor: connStatus.status === 'local' ? 'rgba(16, 185, 129, 0.12)' : connStatus.status === 'proxy' ? 'rgba(59, 130, 246, 0.12)' : connStatus.status === 'cloud' ? 'rgba(245, 158, 11, 0.12)' : 'rgba(239, 68, 68, 0.12)',
              color: connStatus.status === 'local' ? '#10b981' : connStatus.status === 'proxy' ? '#3b82f6' : connStatus.status === 'cloud' ? '#f59e0b' : '#ef4444',
              border: '1px solid currentColor',
              lineHeight: '1.2'
            }}>
              <span style={{
                width: '6px',
                height: '6px',
                borderRadius: '50%',
                backgroundColor: 'currentColor',
                display: 'inline-block'
              }}></span>
              <span>
                {connStatus.status === 'local' ? 'Live (LAN)' : connStatus.status === 'proxy' ? 'Live (Proxy)' : connStatus.status === 'cloud' ? 'Cloud Sync' : `Local Server Connection Failed: ${connStatus.detail}`}
              </span>
            </div>
          </div>
          <p style={{ margin: 0 }}>Here is what's happening in your connected home today.</p>
        </div>
        <div className="hero-stats">
          <div className="hero-stat-card">
            <div className="stat-icon-wrapper primary">
              <Zap size={20} />
            </div>
            <div>
              <span className="stat-label">Total Grid Load</span>
              <span className="stat-value">{powerData ? `${powerData.currentLoad.toLocaleString()} W` : 'Not Configured'}</span>
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
        
        {/* Power Meter Widget */}
        {powerData ? (
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
                  <span className="metric-val">{powerData.currentAmps.toFixed(2)} A</span>
                </div>
                <div className="metric-row">
                  <span className="metric-name">Est. Cost (Month)</span>
                  <span className="metric-val">{monthlyCostRSD.toLocaleString(undefined, { maximumFractionDigits: 0 })} RSD</span>
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
        ) : (
          <section className="dashboard-card power-widget glass" aria-labelledby="power-widget-title" style={{ display: 'flex', flexDirection: 'column', justifyContent: 'center', alignItems: 'center', padding: '40px 24px', textAlign: 'center', gap: '16px' }}>
            <div style={{ width: '48px', height: '48px', borderRadius: '50%', backgroundColor: 'rgba(99, 102, 241, 0.1)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <Zap className="text-primary" size={24} />
            </div>
            <div>
              <h3 id="power-widget-title" style={{ fontSize: '18px', fontWeight: 700, marginBottom: '6px' }}>Active Power Consumption</h3>
              <p style={{ fontSize: '13px', color: 'var(--color-text-muted)', lineHeight: '1.5' }}>
                Grid power meter is not yet configured. Connect your smart electricity meter in settings to track real-time grid load, cost estimates, and billing statistics.
              </p>
            </div>
            <button 
              id="btn-setup-power-meter"
              onClick={() => navigate('/settings')} 
              className="btn secondary" 
              style={{ padding: '6px 16px', fontSize: '12px', border: '1px solid var(--color-border)' }}
            >
              Configure Power Meter
            </button>
          </section>
        )}

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
              const activeMetric = selectedMetrics[sensor.id] || 'temp';
              
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

                  <div className="sensor-readings-row" style={{ display: 'flex', gap: '12px' }}>
                    <button 
                      onClick={() => setSelectedMetrics(prev => ({ ...prev, [sensor.id]: 'temp' }))}
                      className="reading-block"
                      style={{ 
                        cursor: 'pointer', 
                        border: activeMetric === 'temp' ? '1px solid var(--color-primary)' : '1px solid var(--color-border)', 
                        background: activeMetric === 'temp' ? 'rgba(99, 102, 241, 0.08)' : 'transparent', 
                        textAlign: 'left', 
                        flex: 1, 
                        padding: '10px', 
                        borderRadius: '8px', 
                        transition: 'all 0.2s', 
                        display: 'flex', 
                        gap: '8px', 
                        alignItems: 'center',
                        boxShadow: activeMetric === 'temp' ? '0 0 10px rgba(99, 102, 241, 0.15)' : 'none'
                      }}
                      title="View Temperature Sparkline"
                      onMouseOver={(e) => {
                        if (activeMetric !== 'temp') {
                          e.currentTarget.style.backgroundColor = 'rgba(255, 255, 255, 0.03)';
                        }
                      }}
                      onMouseOut={(e) => {
                        if (activeMetric !== 'temp') {
                          e.currentTarget.style.backgroundColor = 'transparent';
                        }
                      }}
                    >
                      <Thermometer size={18} className="text-primary" />
                      <div>
                        <span className="reading-value" style={{ display: 'block', color: 'var(--color-text)' }}>{sensor.currentTemp.toFixed(1)}°C</span>
                        <span className="reading-label" style={{ display: 'block', color: 'var(--color-text-muted)' }}>Temperature</span>
                      </div>
                    </button>

                    <button 
                      onClick={() => setSelectedMetrics(prev => ({ ...prev, [sensor.id]: 'humidity' }))}
                      className="reading-block"
                      style={{ 
                        cursor: 'pointer', 
                        border: activeMetric === 'humidity' ? '1px solid var(--color-secondary)' : '1px solid var(--color-border)', 
                        background: activeMetric === 'humidity' ? 'rgba(16, 185, 129, 0.08)' : 'transparent', 
                        textAlign: 'left', 
                        flex: 1, 
                        padding: '10px', 
                        borderRadius: '8px', 
                        transition: 'all 0.2s', 
                        display: 'flex', 
                        gap: '8px', 
                        alignItems: 'center',
                        boxShadow: activeMetric === 'humidity' ? '0 0 10px rgba(16, 185, 129, 0.15)' : 'none'
                      }}
                      title="View Humidity Sparkline"
                      onMouseOver={(e) => {
                        if (activeMetric !== 'humidity') {
                          e.currentTarget.style.backgroundColor = 'rgba(255, 255, 255, 0.03)';
                        }
                      }}
                      onMouseOut={(e) => {
                        if (activeMetric !== 'humidity') {
                          e.currentTarget.style.backgroundColor = 'transparent';
                        }
                      }}
                    >
                      <Droplets size={18} className="text-secondary" />
                      <div>
                        <span className="reading-value" style={{ display: 'block', color: 'var(--color-text)' }}>{sensor.currentHumidity}%</span>
                        <span className="reading-label" style={{ display: 'block', color: 'var(--color-text-muted)' }}>Humidity</span>
                      </div>
                    </button>
                  </div>

                  <div className="sensor-sparkline">
                    <span className="sparkline-title">24-Hour {activeMetric === 'temp' ? 'Temperature' : 'Humidity'} Wave</span>
                    <div className="chart-wrapper mini">
                      <LineAreaChart 
                        data={sensor.history} 
                        xKey="time" 
                        yKey={activeMetric} 
                        yLabel={activeMetric === 'temp' ? 'Temp' : 'Humidity'}
                        color={activeMetric === 'temp' ? (isGreenhouse ? 'var(--color-warning)' : 'var(--color-primary)') : 'var(--color-secondary)'}
                        fillColor={activeMetric === 'temp' ? (isGreenhouse ? 'url(#gradient-amber)' : 'url(#gradient-indigo)') : 'url(#gradient-emerald)'}
                        height={100}
                        valueSuffix={activeMetric === 'temp' ? '°C' : '%'}
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
            <p>{powerData ? <>Your standby load is currently <strong>{Math.round(powerData.currentLoad * 0.08)} Watts</strong> (about 8% of your average load).</> : "Connect your smart power meter to receive active energy efficiency coaching recommendations."}</p>
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
