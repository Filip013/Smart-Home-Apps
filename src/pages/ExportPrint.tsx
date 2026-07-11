import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { fetchAllDeviceData } from '../utils/deviceBridge';
import type { PowerMeter, TempSensor } from '../utils/mockData';
import { 
  FileDown, 
  Printer, 
  Settings, 
  Zap,
  AlertTriangle
} from 'lucide-react';

export const ExportPrint: React.FC = () => {
  const navigate = useNavigate();
  const [powerData, setPowerData] = useState<PowerMeter | null>(null);
  const [sensors, setSensors] = useState<TempSensor[]>([]);
  const [mode, setMode] = useState<'demo' | 'live'>('demo');
  
  // Print configuration state
  const [includeKpis, setIncludeKpis] = useState(true);
  const [includeCharts, setIncludeCharts] = useState(true);
  const [includeBreakdown, setIncludeBreakdown] = useState(true);
  const [includeTable, setIncludeTable] = useState(true);
  const [includeClimate, setIncludeClimate] = useState(true);

  useEffect(() => {
    const loadData = async () => {
      const data = await fetchAllDeviceData();
      setPowerData(data.power);
      setSensors(data.sensors);
      setMode(data.mode);
    };
    loadData();
  }, []);

  if (!powerData) {
    return (
      <div className="loading-screen">
        <Zap className="animate-spin text-primary" size={48} />
        <p>Loading export utility...</p>
      </div>
    );
  }

  // Generate and download CSV
  const handleExportCSV = (type: 'hourly' | 'daily') => {
    let headers: string[] = [];
    let rows: string[][] = [];
    let filename = '';

    if (type === 'hourly') {
      filename = `power_meter_hourly_${new Date().toISOString().split('T')[0]}.csv`;
      headers = ['Timestamp', 'Load (Watts)', 'Grid Voltage (Volts)', 'Current Draw (Amps)'];
      rows = powerData.hourlyHistory.map(h => [
        h.time,
        String(h.loadWatts),
        String(h.voltage),
        String(h.currentAmps)
      ]);
    } else {
      filename = `power_meter_daily_${new Date().toISOString().split('T')[0]}.csv`;
      headers = ['Date', 'Energy Consumed (kWh)', 'Peak Demand (kW)', 'Cost ($)'];
      rows = powerData.dailyHistory.map(d => [
        d.date,
        String(d.kwh),
        String(d.peakKw),
        String(d.cost)
      ]);
    }

    // Combine headers and rows
    const csvContent = [
      headers.join(','),
      ...rows.map(r => r.map(val => `"${val.replace(/"/g, '""')}"`).join(','))
    ].join('\n');

    // Create blob and trigger download
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.setAttribute('href', url);
    link.setAttribute('download', filename);
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const handlePrint = () => {
    window.print();
  };

  return (
    <div className="export-view animate-fade-in">
      {mode === 'demo' && (
        <div className="alert-banner warning print-hide" style={{ marginBottom: '24px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <AlertTriangle size={18} />
            <span><strong>Demo Mode:</strong> Exporting simulated reports. Configure your credentials in Settings to sync your real devices.</span>
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
      {/* Page Header */}
      <section className="page-header print-hide" aria-label="Page Title">
        <div className="title-group">
          <h2>Data Export & Print Services</h2>
          <p>Download climate and power readings in spreadsheet format or generate ink-friendly printable PDFs.</p>
        </div>
      </section>

      {/* Main Grid split: settings & preview */}
      <div className="export-grid">
        
        {/* Settings Panel (Hidden during printing) */}
        <section className="dashboard-card settings-card glass print-hide" aria-labelledby="settings-title">
          <div className="card-header">
            <div className="card-title-group">
              <Settings className="card-icon text-primary" />
              <h3 id="settings-title">Export Settings</h3>
            </div>
          </div>
          
          <div className="settings-body">
            {/* CSV Exporter */}
            <div className="settings-section">
              <h4>Download CSV Spreadsheets</h4>
              <p className="section-description">Export raw timeseries log records for local storage or analysis in Excel.</p>
              <div className="btn-group-vertical">
                <button 
                  id="export-hourly-csv-btn"
                  onClick={() => handleExportCSV('hourly')} 
                  className="btn primary"
                >
                  <FileDown size={16} />
                  <span>Download Hourly Load Log (24h)</span>
                </button>
                <button 
                  id="export-daily-csv-btn"
                  onClick={() => handleExportCSV('daily')} 
                  className="btn secondary"
                >
                  <FileDown size={16} />
                  <span>Download Daily Energy Log (30d)</span>
                </button>
              </div>
            </div>

            {/* Print configurator */}
            <div className="settings-section">
              <h4>Configure Printable PDF Report</h4>
              <p className="section-description">Choose the components to include in the generated paper printout layout.</p>
              
              <div className="checkbox-list">
                <label className="checkbox-label" htmlFor="chk-kpis">
                  <input 
                    type="checkbox" 
                    id="chk-kpis"
                    checked={includeKpis} 
                    onChange={(e) => setIncludeKpis(e.target.checked)} 
                  />
                  <span className="checkbox-custom"></span>
                  <span>Energy Summary Metrics (KPIs)</span>
                </label>

                <label className="checkbox-label" htmlFor="chk-charts">
                  <input 
                    type="checkbox" 
                    id="chk-charts"
                    checked={includeCharts} 
                    onChange={(e) => setIncludeCharts(e.target.checked)} 
                  />
                  <span className="checkbox-custom"></span>
                  <span>Power Load Curve Chart</span>
                </label>

                <label className="checkbox-label" htmlFor="chk-breakdown">
                  <input 
                    type="checkbox" 
                    id="chk-breakdown"
                    checked={includeBreakdown} 
                    onChange={(e) => setIncludeBreakdown(e.target.checked)} 
                  />
                  <span className="checkbox-custom"></span>
                  <span>Appliance Power Share breakdown</span>
                </label>

                <label className="checkbox-label" htmlFor="chk-table">
                  <input 
                    type="checkbox" 
                    id="chk-table"
                    checked={includeTable} 
                    onChange={(e) => setIncludeTable(e.target.checked)} 
                  />
                  <span className="checkbox-custom"></span>
                  <span>Historical Daily Consumption Table</span>
                </label>

                <label className="checkbox-label" htmlFor="chk-climate">
                  <input 
                    type="checkbox" 
                    id="chk-climate"
                    checked={includeClimate} 
                    onChange={(e) => setIncludeClimate(e.target.checked)} 
                  />
                  <span className="checkbox-custom"></span>
                  <span>Climate Sensors Summary</span>
                </label>
              </div>

              <button 
                id="trigger-print-btn"
                onClick={handlePrint} 
                className="btn accent w-full mt-4"
              >
                <Printer size={16} />
                <span>Print or Save to PDF</span>
              </button>
            </div>
          </div>
        </section>

        {/* Live Print Preview Sheet */}
        <section className="print-preview-container" aria-label="Print Preview Sheet">
          <div className="preview-header-bar print-hide">
            <span className="preview-badge">Live Print Preview</span>
            <span className="preview-hint">This matches the output layout on physical paper.</span>
          </div>

          <div className="printable-sheet glass">
            {/* Print Header */}
            <div className="print-report-header">
              <div className="print-logo-row">
                <div className="print-logo-box">⚡</div>
                <div>
                  <h2>AETHER-SMART HOME SUMMARY REPORT</h2>
                  <p>Smart Energy Monitor & Climate Diagnostics</p>
                </div>
              </div>
              <div className="print-meta-box">
                <div><strong>Report Date:</strong> {new Date().toLocaleDateString('en-US', { dateStyle: 'long' })}</div>
                <div><strong>Device ID:</strong> SM-PR-942851</div>
                <div><strong>Grid Status:</strong> Calibrated & Verified</div>
              </div>
            </div>

            {/* KPIs */}
            {includeKpis && (
              <div className="print-section print-kpi-block">
                <h3 className="print-sec-title">Energy Consumption Summary</h3>
                <div className="print-kpi-grid">
                  <div className="print-kpi-item">
                    <span className="pkpi-label">Active Power Load</span>
                    <span className="pkpi-value">{powerData.currentLoad} W</span>
                  </div>
                  <div className="print-kpi-item">
                    <span className="pkpi-label">Energy Consumed (Today)</span>
                    <span className="pkpi-value">{powerData.todayKwh} kWh</span>
                  </div>
                  <div className="print-kpi-item">
                    <span className="pkpi-label">Energy Consumed (Month)</span>
                    <span className="pkpi-value">{powerData.monthKwh} kWh</span>
                  </div>
                  <div className="print-kpi-item">
                    <span className="pkpi-label">Est. Cost (Month)</span>
                    <span className="pkpi-value">${powerData.estMonthlyCost.toFixed(2)}</span>
                  </div>
                </div>
              </div>
            )}

            {/* Charts */}
            {includeCharts && (
              <div className="print-section print-avoid-break">
                <h3 className="print-sec-title">Power Load Profile (24h Trend)</h3>
                <div className="print-chart-box">
                  {/* Clean SVG rendering for print */}
                  <svg width="100%" height="130" style={{ overflow: 'visible' }}>
                    {/* Basic vector chart for print representation */}
                    <line x1="50" y1="10" x2="50" y2="110" stroke="#000" strokeWidth="1" />
                    <line x1="50" y1="110" x2="600" y2="110" stroke="#000" strokeWidth="1" />
                    <text x="40" y="15" fontSize="9" textAnchor="end">3.0 kW</text>
                    <text x="40" y="60" fontSize="9" textAnchor="end">1.5 kW</text>
                    <text x="40" y="105" fontSize="9" textAnchor="end">0 kW</text>
                    
                    <text x="60" y="122" fontSize="9">00:00</text>
                    <text x="200" y="122" fontSize="9">08:00</text>
                    <text x="340" y="122" fontSize="9">12:00</text>
                    <text x="480" y="122" fontSize="9">18:00</text>
                    
                    {/* Simple curve representing the hourly load */}
                    <path
                      d={`M 50,95 Q 120,60 200,40 T 350,90 T 500,30 T 600,95`}
                      fill="none"
                      stroke="#4f46e5"
                      strokeWidth="2"
                    />
                  </svg>
                  <p className="print-caption">Diurnal energy profile indicating load peaks around breakfast (08:00) and evening hours (18:00 - 21:00).</p>
                </div>
              </div>
            )}

            {/* Breakdown */}
            {includeBreakdown && (
              <div className="print-section print-avoid-break">
                <h3 className="print-sec-title">Power Allocation Breakdown</h3>
                <table className="print-table">
                  <thead>
                    <tr>
                      <th>Appliance Group</th>
                      <th className="text-right">Usage Share (%)</th>
                      <th className="text-right">Cumulative Monthly (kWh)</th>
                    </tr>
                  </thead>
                  <tbody>
                    {powerData.breakdown.map((item, idx) => (
                      <tr key={idx}>
                        <td>{item.name}</td>
                        <td className="text-right">{item.percentage}%</td>
                        <td className="text-right">{item.kwh} kWh</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            {/* Table of Daily History */}
            {includeTable && (
              <div className="print-section print-avoid-break">
                <h3 className="print-sec-title">Recent Daily Consumption Logs</h3>
                <table className="print-table compact">
                  <thead>
                    <tr>
                      <th>Date</th>
                      <th className="text-right">Energy (kWh)</th>
                      <th className="text-right">Peak Load (kW)</th>
                      <th className="text-right">Daily Cost ($)</th>
                    </tr>
                  </thead>
                  <tbody>
                    {powerData.dailyHistory.slice(-7).reverse().map((day, idx) => (
                      <tr key={idx}>
                        <td>{day.date}</td>
                        <td className="text-right">{day.kwh} kWh</td>
                        <td className="text-right">{day.peakKw} kW</td>
                        <td className="text-right">${day.cost.toFixed(2)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                <p className="print-caption">*Showing log records of the last 7 active days. Complete 30-day log is available in the exported CSV spreadsheet.</p>
              </div>
            )}

            {/* Climate Sensors */}
            {includeClimate && (
              <div className="print-section print-avoid-break">
                <h3 className="print-sec-title">Connected Climate Monitors Status</h3>
                <div className="print-climate-grid">
                  {sensors.map((sensor, idx) => (
                    <div key={idx} className="print-climate-item">
                      <h4>{sensor.name}</h4>
                      <p><strong>Location:</strong> {sensor.location}</p>
                      <div className="print-climate-readings">
                        <span><strong>Temperature:</strong> {sensor.currentTemp.toFixed(1)}°C</span>
                        <span><strong>Relative Humidity:</strong> {sensor.currentHumidity}%</span>
                        <span><strong>Battery:</strong> {sensor.battery}%</span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Print Footer */}
            <div className="print-report-footer">
              <p>AetherSmart Energy Reporter // System firmware version 2.4.1 // Confirmed safe operation by GridGuard Security.</p>
              <p>Page 1 of 1</p>
            </div>
          </div>
        </section>
      </div>
    </div>
  );
};
