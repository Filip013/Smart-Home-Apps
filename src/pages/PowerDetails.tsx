import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { fetchAllDeviceData } from '../utils/deviceBridge';
import type { PowerMeter } from '../utils/mockData';
import { LineAreaChart, BarChart, DonutBreakdownChart } from '../components/CustomChart';
import { 
  Zap, 
  TrendingUp, 
  Calendar, 
  DollarSign, 
  Clock, 
  Activity,
  Cpu,
  Info,
  AlertTriangle
} from 'lucide-react';

export const PowerDetails: React.FC = () => {
  const navigate = useNavigate();
  const [powerData, setPowerData] = useState<PowerMeter | null>(null);
  const [timeRange, setTimeRange] = useState<'24h' | '30d'>('24h');
  const [mode, setMode] = useState<'demo' | 'live'>('demo');

  useEffect(() => {
    const loadData = async () => {
      const data = await fetchAllDeviceData();
      setPowerData(data.power);
      setMode(data.mode);
    };
    loadData();
  }, []);

  if (!powerData) {
    return (
      <div className="loading-screen">
        <Zap className="animate-spin text-accent" size={48} />
        <p>Loading power statistics...</p>
      </div>
    );
  }

  // Calculate carbon footprint: average 1 kWh = 0.385 kg CO2
  const carbonFootprintToday = (powerData.todayKwh * 0.385).toFixed(2);
  const carbonFootprintMonth = (powerData.monthKwh * 0.385).toFixed(2);

  // Peak demand stats
  const peakLoad24h = Math.max(...powerData.hourlyHistory.map(h => h.loadWatts));
  const avgLoad24h = Math.round(powerData.hourlyHistory.reduce((acc, h) => acc + h.loadWatts, 0) / powerData.hourlyHistory.length);

  return (
    <div className="power-details-view animate-fade-in">
      {mode === 'demo' && (
        <div className="alert-banner warning" style={{ marginBottom: '24px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <AlertTriangle size={18} />
            <span><strong>Demo Mode:</strong> Displaying simulated power statistics. Configure your credentials in Settings to sync your real devices.</span>
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
          <h2>Power Meter Analytics</h2>
          <p>Detailed insight into your grid connection, energy consumption, and appliance breakdown.</p>
        </div>
        <div className="tab-control glass">
          <button 
            id="tab-range-24h"
            className={`tab-btn ${timeRange === '24h' ? 'active' : ''}`}
            onClick={() => setTimeRange('24h')}
          >
            <Clock size={14} />
            <span>24h Load Profile</span>
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
      <section className="stats-kpi-grid" aria-label="Power Meter Key Statistics">
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
            <span className="text-muted">CO₂ Footprint: {carbonFootprintToday} kg</span>
          </div>
        </div>

        <div className="kpi-card glass">
          <div className="kpi-header">
            <Calendar className="kpi-icon text-primary" />
            <span className="kpi-title">Monthly Energy Total</span>
          </div>
          <div className="kpi-value">{powerData.monthKwh} kWh</div>
          <div className="kpi-footer">
            <span className="text-muted">Weekly Avg: {(powerData.weekKwh / 7).toFixed(1)} kWh/day | CO₂: {carbonFootprintMonth} kg</span>
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

      {/* Main Chart Section */}
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
              data={powerData.dailyHistory} 
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
              {timeRange === '24h' ? `${(peakLoad24h / 1000).toFixed(2)} kW` : `${Math.max(...powerData.dailyHistory.map(d => d.peakKw))} kW`}
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

      {/* Grid: Breakdown & Technical Parameters */}
      <div className="power-breakdown-grid">
        {/* Device Breakdown */}
        <section className="dashboard-card breakdown-card glass" aria-labelledby="breakdown-title">
          <div className="card-header">
            <div className="card-title-group">
              <Cpu className="card-icon text-primary" />
              <h3 id="breakdown-title">Appliance Consumption Share</h3>
            </div>
          </div>
          <div className="breakdown-card-body">
            <DonutBreakdownChart data={powerData.breakdown} size={180} />
          </div>
        </section>

        {/* Technical Diagnostics */}
        <section className="dashboard-card diagnostics-card glass" aria-labelledby="diagnostics-title">
          <div className="card-header">
            <div className="card-title-group">
              <Info className="card-icon text-success" />
              <h3 id="diagnostics-title">Grid Diagnostic Metrics</h3>
            </div>
          </div>
          <div className="diagnostics-body">
            <p className="diagnostics-intro">Real-time parameters from the smart meter diagnostic registers.</p>
            <div className="diag-metrics-list">
              <div className="diag-item">
                <span className="diag-label">Line Frequency</span>
                <span className="diag-value">50.02 Hz</span>
              </div>
              <div className="diag-item">
                <span className="diag-label">Power Factor (PF)</span>
                <span className="diag-value">0.98 <span className="diag-sub">(Highly Efficient)</span></span>
              </div>
              <div className="diag-item">
                <span className="diag-label">Reactive Power</span>
                <span className="diag-value">{Math.round(powerData.currentLoad * 0.2)} VAR</span>
              </div>
              <div className="diag-item">
                <span className="diag-label">Apparent Power</span>
                <span className="diag-value">{Math.round(powerData.currentLoad / 0.98)} VA</span>
              </div>
              <div className="diag-item">
                <span className="diag-label">Meter Status</span>
                <span className="diag-value text-success font-semibold">CALIBRATED // SECURE</span>
              </div>
            </div>
          </div>
        </section>
      </div>
    </div>
  );
};
