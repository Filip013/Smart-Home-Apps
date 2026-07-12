import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { fetchAllDeviceData, fetchRealDailyClimateStats } from '../utils/deviceBridge';
import type { PowerMeter, TempSensor } from '../utils/mockData';
import { LineAreaChart, BarChart } from '../components/CustomChart';
import { 
  FileDown, 
  Printer, 
  Settings, 
  Zap,
  AlertTriangle,
  Thermometer,
  Calendar
} from 'lucide-react';

export const ExportPrint: React.FC = () => {
  const navigate = useNavigate();
  const [powerData, setPowerData] = useState<PowerMeter | null>(null);
  const [sensors, setSensors] = useState<TempSensor[]>([]);
  const [climateHistory, setClimateHistory] = useState<{ date: string; sensors: any }[]>([]);
  const [mode, setMode] = useState<'demo' | 'live'>('demo');
  const [loading, setLoading] = useState(true);

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

  const [selectedMonth, setSelectedMonth] = useState(getLocalCurrentMonthStr());
  const [selectedSensorKey, setSelectedSensorKey] = useState<string>('sensor1');
  const [climateMetric, setClimateMetric] = useState<'temp' | 'humidity'>('temp');

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
        // Generate 90 days of mock climate history for demo mode
        const mockHistory = [];
        const now = new Date();
        for (let i = 89; i >= 0; i--) {
          const d = new Date(now.getTime() - i * 24 * 60 * 60 * 1000);
          const dateStr = d.toISOString().split('T')[0];
          mockHistory.push({
            date: dateStr,
            sensors: {
              sensor1: {
                avgTemp: Number((21.0 + Math.random() * 2.0).toFixed(1)),
                avgHumidity: Math.round(40 + Math.random() * 10)
              },
              sensor2: {
                avgTemp: Number((26.0 + Math.random() * 4.0).toFixed(1)),
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
        <Zap className="animate-spin text-primary" size={48} />
        <p>Loading export utility...</p>
      </div>
    );
  }

  // Formatting dates helper
  const formatChartDate = (dateStr: string) => {
    if (!dateStr.includes('-')) return dateStr;
    try {
      const [, , day] = dateStr.split('-');
      return day; // Just show day of the month (e.g. "12") for monthly view X axis
    } catch {
      return dateStr;
    }
  };

  const powerDailyData = powerData
    ? powerData.dailyHistory
        .filter(d => d.date.startsWith(selectedMonth))
        .map(d => ({
          ...d,
          date: formatChartDate(d.date)
        }))
    : [];

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

  // Merged Daily Report Table Data
  const datesSet = new Set<string>();
  if (powerData) {
    powerData.dailyHistory.forEach(d => {
      if (d.date.startsWith(selectedMonth)) datesSet.add(d.date);
    });
  }
  climateHistory.forEach(c => {
    if (c.date.startsWith(selectedMonth)) datesSet.add(c.date);
  });
  const sortedDates = Array.from(datesSet).sort();

  const reportTableData = sortedDates.map(date => {
    const pEntry = powerData?.dailyHistory.find(d => d.date === date);
    const cEntry = climateHistory.find(c => c.date === date);
    const sensorData = cEntry?.sensors?.[selectedSensorKey] || {};
    const kwh = pEntry?.kwh !== undefined ? pEntry.kwh : null;
    const cost = pEntry !== undefined 
      ? calculateDailyCostRSD(pEntry.kwh, pEntry.hourly)
      : null;
    return {
      date,
      kwh,
      cost,
      temp: sensorData.avgTemp !== undefined ? sensorData.avgTemp : null,
      humidity: sensorData.avgHumidity !== undefined ? sensorData.avgHumidity : null
    };
  });

  const totalMonthlyKwh = reportTableData.reduce((acc, d) => acc + (d.kwh || 0), 0);
  const totalMonthlyCostRSD = reportTableData.reduce((acc, d) => acc + (d.cost || 0), 0);

  const handleExportCSV = () => {
    const filename = `smart_home_report_${selectedMonth}.csv`;
    const headers = ['Date', 'Energy Consumed (kWh)', 'Est Cost (RSD)', 'Average Temp (°C)', 'Average Humidity (%)'];
    const rows = reportTableData.map(d => [
      d.date,
      d.kwh !== null ? String(d.kwh) : 'N/A',
      d.cost !== null ? d.cost.toFixed(2) : 'N/A',
      d.temp !== null ? String(d.temp) : 'N/A',
      d.humidity !== null ? String(d.humidity) : 'N/A'
    ]);

    const csvContent = [
      headers.join(','),
      ...rows.map(r => r.map(val => `"${val.replace(/"/g, '""')}"`).join(','))
    ].join('\n');

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

  const handleExportFullHistoryCSV = () => {
    const filename = `smart_home_full_history_${new Date().toISOString().split('T')[0]}.csv`;
    const headers = ['Date', 'Energy Consumed (kWh)', 'Est Cost (RSD)', 'Average Temp (°C)', 'Average Humidity (%)'];
    
    // Collect all unique dates in the history
    const allDatesSet = new Set<string>();
    if (powerData) {
      powerData.dailyHistory.forEach(d => allDatesSet.add(d.date));
    }
    climateHistory.forEach(c => allDatesSet.add(c.date));
    const sortedAllDates = Array.from(allDatesSet).sort();

    const rows = sortedAllDates.map(date => {
      const pEntry = powerData?.dailyHistory.find(d => d.date === date);
      const cEntry = climateHistory.find(c => c.date === date);
      const sensorData = cEntry?.sensors?.[selectedSensorKey] || {};
      const kwh = pEntry?.kwh !== undefined ? pEntry.kwh : null;
      const cost = pEntry !== undefined 
        ? calculateDailyCostRSD(pEntry.kwh, pEntry.hourly)
        : null;
      return [
        date,
        kwh !== null ? String(kwh) : 'N/A',
        cost !== null ? cost.toFixed(2) : 'N/A',
        sensorData.avgTemp !== undefined ? String(sensorData.avgTemp) : 'N/A',
        sensorData.avgHumidity !== undefined ? String(sensorData.avgHumidity) : 'N/A'
      ];
    });

    const csvContent = [
      headers.join(','),
      ...rows.map(r => r.map(val => `"${val.replace(/"/g, '""')}"`).join(','))
    ].join('\n');

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
            <span><strong>Demo Mode:</strong> Exporting simulated reports. Configure credentials in Settings to sync Firestore.</span>
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
          <p>Export historical archives to CSV spreadsheets or print clean reports containing charts and consolidated logs.</p>
        </div>
      </section>

      {/* Main Grid split: settings & preview */}
      <div className="export-grid" style={{ display: 'grid', gridTemplateColumns: '320px 1f', gap: '24px', alignItems: 'start' }}>
        
        {/* Settings Panel (Hidden during printing) */}
        <section className="dashboard-card settings-card glass print-hide" aria-labelledby="settings-title" style={{ padding: '20px' }}>
          <div className="card-header" style={{ marginBottom: '16px' }}>
            <div className="card-title-group">
              <Settings className="card-icon text-primary" />
              <h3 id="settings-title">Configure Report</h3>
            </div>
          </div>
          
          <div className="settings-body" style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
            <div className="settings-section">
              <label style={{ display: 'block', fontSize: '13px', fontWeight: 600, color: 'var(--color-text-muted)', marginBottom: '6px' }}>Select Calendar Month:</label>
              <input 
                type="month"
                value={selectedMonth}
                onChange={(e) => setSelectedMonth(e.target.value)}
                max={getLocalCurrentMonthStr()}
                style={{
                  width: '100%',
                  padding: '8px 12px',
                  borderRadius: '6px',
                  border: '1px solid var(--color-border)',
                  backgroundColor: 'var(--color-card-bg)',
                  color: 'var(--color-text)',
                  fontSize: '14px',
                  fontWeight: 600
                }}
              />
            </div>

            <div className="settings-section">
              <label style={{ display: 'block', fontSize: '13px', fontWeight: 600, color: 'var(--color-text-muted)', marginBottom: '6px' }}>Climate Sensor Source:</label>
              <select
                value={selectedSensorKey}
                onChange={(e) => setSelectedSensorKey(e.target.value)}
                style={{
                  width: '100%',
                  padding: '8px 12px',
                  borderRadius: '6px',
                  border: '1px solid var(--color-border)',
                  backgroundColor: 'var(--color-card-bg)',
                  color: 'var(--color-text)',
                  fontSize: '14px',
                  fontWeight: 600
                }}
              >
                <option value="sensor1">{sensors[0]?.name || 'Living Room Sensor'}</option>
                <option value="sensor2">{sensors[1]?.name || 'Greenhouse Sensor'}</option>
              </select>
            </div>

            <div className="settings-section">
              <label style={{ display: 'block', fontSize: '13px', fontWeight: 600, color: 'var(--color-text-muted)', marginBottom: '6px' }}>Report Climate Metric:</label>
              <div className="tab-control glass" style={{ width: '100%', padding: '2px', display: 'flex' }}>
                <button 
                  className={`tab-btn ${climateMetric === 'temp' ? 'active' : ''}`}
                  onClick={() => setClimateMetric('temp')}
                  style={{ flex: 1, padding: '6px', fontSize: '12px' }}
                >
                  Temp (°C)
                </button>
                <button 
                  className={`tab-btn ${climateMetric === 'humidity' ? 'active' : ''}`}
                  onClick={() => setClimateMetric('humidity')}
                  style={{ flex: 1, padding: '6px', fontSize: '12px' }}
                >
                  Humidity (%)
                </button>
              </div>
            </div>

            <hr style={{ border: '0', borderTop: '1px solid var(--color-border)', margin: '4px 0' }} />

            <div className="settings-section" style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
              <button 
                id="export-month-csv-btn"
                onClick={handleExportCSV} 
                className="btn primary w-full"
                style={{ justifyContent: 'center', gap: '8px', padding: '10px' }}
              >
                <FileDown size={16} />
                <span>Export Selected Month CSV</span>
              </button>

              <button 
                id="export-full-csv-btn"
                onClick={handleExportFullHistoryCSV} 
                className="btn secondary w-full"
                style={{ justifyContent: 'center', gap: '8px', padding: '10px' }}
              >
                <FileDown size={16} />
                <span>Export Full 3-Month CSV</span>
              </button>

              <button 
                id="trigger-print-btn"
                onClick={handlePrint} 
                className="btn accent w-full"
                style={{ justifyContent: 'center', gap: '8px', padding: '10px', marginTop: '4px' }}
              >
                <Printer size={16} />
                <span>Print or Save PDF Report</span>
              </button>
            </div>
          </div>
        </section>

        {/* Live Print Preview Sheet */}
        <section className="print-preview-container" aria-label="Print Preview Sheet" style={{ flex: 1 }}>
          <div className="preview-header-bar print-hide" style={{ marginBottom: '12px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span className="preview-badge" style={{ backgroundColor: 'var(--color-primary-light)', color: 'var(--color-primary)', padding: '4px 8px', borderRadius: '4px', fontSize: '11px', fontWeight: 700 }}>Report Preview</span>
            <span className="preview-hint" style={{ fontSize: '12px', color: 'var(--color-text-muted)' }}>This preview shows exactly what will be printed.</span>
          </div>

          <div className="printable-sheet glass" style={{ padding: '30px', backgroundColor: 'var(--color-card-bg)', border: '1px solid var(--color-border)', borderRadius: '8px' }}>
            {/* Print Header */}
            <div className="print-report-header" style={{ display: 'flex', justifyContent: 'space-between', borderBottom: '2px solid var(--color-border)', paddingBottom: '20px', marginBottom: '24px' }}>
              <div>
                <h2 style={{ fontSize: '20px', fontWeight: 800, margin: '0 0 4px 0', letterSpacing: '0.5px' }}>CONSUMPTION & CLIMATE REPORT</h2>
                <p style={{ margin: '0', fontSize: '13px', color: 'var(--color-text-muted)' }}>Smart Home Energy & Environment Log</p>
              </div>
              <div style={{ textAlign: 'right', fontSize: '12px', color: 'var(--color-text-muted)', lineHeight: '1.5' }}>
                <div><strong>Selected Month:</strong> {selectedMonth}</div>
                <div><strong>Climate Source:</strong> {sensors.find(s => s.id === selectedSensorKey)?.name || selectedSensorKey}</div>
                <div><strong>Generated:</strong> {new Date().toLocaleDateString('en-US', { dateStyle: 'medium' })}</div>
              </div>
            </div>

            {/* Monthly Summary Metrics */}
            <div className="print-section" style={{ marginBottom: '24px' }}>
              <div style={{ display: 'flex', gap: '20px' }}>
                <div style={{ flex: 1, padding: '12px 16px', background: 'rgba(255, 255, 255, 0.02)', border: '1px solid var(--color-border)', borderRadius: '6px' }}>
                  <span style={{ display: 'block', fontSize: '11px', fontWeight: 600, color: 'var(--color-text-muted)', marginBottom: '4px', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Total Monthly Consumption</span>
                  <span style={{ fontSize: '20px', fontWeight: 800, color: 'var(--color-primary)' }}>{totalMonthlyKwh.toFixed(1)} kWh</span>
                </div>
                <div style={{ flex: 1, padding: '12px 16px', background: 'rgba(255, 255, 255, 0.02)', border: '1px solid var(--color-border)', borderRadius: '6px' }}>
                  <span style={{ display: 'block', fontSize: '11px', fontWeight: 600, color: 'var(--color-text-muted)', marginBottom: '4px', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Total Estimated Cost</span>
                  <span style={{ fontSize: '20px', fontWeight: 800, color: 'var(--color-warning)' }}>{totalMonthlyCostRSD.toLocaleString(undefined, { maximumFractionDigits: 0 })} RSD</span>
                </div>
              </div>
            </div>

            {/* Graphs Section */}
            <div className="print-section" style={{ marginBottom: '28px' }}>
              <h3 style={{ fontSize: '14px', fontWeight: 700, margin: '0 0 16px 0', textTransform: 'uppercase', color: 'var(--color-text-muted)', borderBottom: '1px solid var(--color-border)', paddingBottom: '6px' }}>Graphs Preview</h3>
              
              <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
                {powerData && (
                  <div>
                    <h4 style={{ fontSize: '13px', fontWeight: 600, margin: '0 0 8px 0' }}>Daily Power Consumption (kWh)</h4>
                    <div style={{ background: 'rgba(255, 255, 255, 0.01)', border: '1px solid var(--color-border)', borderRadius: '6px', padding: '12px' }}>
                      <BarChart 
                        data={powerDailyData} 
                        xKey="date" 
                        yKey="kwh"
                        yLabel="Energy Use"
                        color="var(--color-primary)"
                        height={180}
                        valueSuffix=" kWh"
                      />
                    </div>
                  </div>
                )}

                <div>
                  <h4 style={{ fontSize: '13px', fontWeight: 600, margin: '0 0 8px 0' }}>
                    Daily Climate: {climateMetric === 'temp' ? 'Average Temperature (°C)' : 'Average Humidity (%)'}
                  </h4>
                  <div style={{ background: 'rgba(255, 255, 255, 0.01)', border: '1px solid var(--color-border)', borderRadius: '6px', padding: '12px' }}>
                    <LineAreaChart 
                      data={climateDailyData} 
                      xKey="date" 
                      yKey={climateMetric}
                      yLabel={climateMetric === 'temp' ? 'Avg Temp' : 'Avg Humidity'}
                      color={climateMetric === 'temp' ? 'var(--color-primary)' : 'var(--color-secondary)'}
                      fillColor={climateMetric === 'temp' ? 'url(#gradient-indigo)' : 'url(#gradient-emerald)'}
                      height={180}
                      valueSuffix={climateMetric === 'temp' ? '°C' : '%'}
                    />
                  </div>
                </div>
              </div>
            </div>

            {/* Table Section */}
            <div className="print-section" style={{ marginBottom: '20px' }}>
              <h3 style={{ fontSize: '14px', fontWeight: 700, margin: '0 0 12px 0', textTransform: 'uppercase', color: 'var(--color-text-muted)', borderBottom: '1px solid var(--color-border)', paddingBottom: '6px' }}>Consolidated Log Table</h3>
              
              <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12px' }}>
                  <thead>
                    <tr style={{ borderBottom: '2px solid var(--color-border)', textAlign: 'left' }}>
                      <th style={{ padding: '8px 4px', fontWeight: 600 }}>Date</th>
                      <th style={{ padding: '8px 4px', fontWeight: 600, textAlign: 'right' }}>Energy (kWh)</th>
                      <th style={{ padding: '8px 4px', fontWeight: 600, textAlign: 'right' }}>Daily Cost (RSD)</th>
                      <th style={{ padding: '8px 4px', fontWeight: 600, textAlign: 'right' }}>Avg Temp (°C)</th>
                      <th style={{ padding: '8px 4px', fontWeight: 600, textAlign: 'right' }}>Avg Humidity (%)</th>
                    </tr>
                  </thead>
                  <tbody>
                    {reportTableData.length === 0 ? (
                      <tr>
                        <td colSpan={5} style={{ padding: '16px 4px', textAlign: 'center', color: 'var(--color-text-muted)' }}>
                          No historical data found for this calendar month.
                        </td>
                      </tr>
                    ) : (
                      reportTableData.map((row, idx) => (
                        <tr key={idx} style={{ borderBottom: '1px solid var(--color-border)' }}>
                          <td style={{ padding: '6px 4px' }}>{row.date}</td>
                          <td style={{ padding: '6px 4px', textAlign: 'right' }}>
                            {row.kwh !== null ? `${row.kwh.toFixed(1)} kWh` : 'N/A'}
                          </td>
                          <td style={{ padding: '6px 4px', textAlign: 'right' }}>
                            {row.cost !== null ? `${row.cost.toFixed(1)} RSD` : 'N/A'}
                          </td>
                          <td style={{ padding: '6px 4px', textAlign: 'right' }}>
                            {row.temp !== null ? `${row.temp.toFixed(1)}°C` : 'N/A'}
                          </td>
                          <td style={{ padding: '6px 4px', textAlign: 'right' }}>
                            {row.humidity !== null ? `${row.humidity}%` : 'N/A'}
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Print Footer */}
            <div className="print-report-footer" style={{ marginTop: '30px', borderTop: '1px solid var(--color-border)', paddingTop: '12px', display: 'flex', justifyContent: 'space-between', fontSize: '10px', color: 'var(--color-text-muted)' }}>
              <span>Historical Summary Report // AetherSmart Home Analytics</span>
              <span>Page 1 of 1</span>
            </div>
          </div>
        </section>
      </div>
    </div>
  );
};
