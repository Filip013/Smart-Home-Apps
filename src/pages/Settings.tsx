import React, { useState, useEffect } from 'react';
import { 
  getTuyaConfig, 
  saveTuyaConfig, 
  clearTokenCache,
  testFullConnection,
  makeTuyaRequest,
  auth,
  db
} from '../utils/tuyaService';
import type { TuyaConfig } from '../utils/tuyaService';
import { doc, setDoc } from 'firebase/firestore';
import { 
  Cloud, 
  Key, 
  Cpu, 
  CheckCircle2, 
  XCircle, 
  RefreshCw,
  Server,
  Database,
  ChevronDown,
  ChevronUp
} from 'lucide-react';

export const Settings: React.FC = () => {
  // Collapsible sections state (collapsed by default)
  const [tuyaExpanded, setTuyaExpanded] = useState(false);
  const [dpExpanded, setDpExpanded] = useState(false);
  const [backupExpanded, setBackupExpanded] = useState(false);

  // Tuya credentials state
  const [clientId, setClientId] = useState('');
  const [clientSecret, setClientSecret] = useState('');
  const [diagResult, setDiagResult] = useState<{
    token: boolean;
    tokenError?: string;
    devices: {
      temp1: { success: boolean; msg: string };
      temp2: { success: boolean; msg: string };
      power: { success: boolean; msg: string };
    };
  } | null>(null);
  const [region, setRegion] = useState<'us' | 'eu' | 'eu-west' | 'cn' | 'in'>('us');
  const [tempDeviceId1, setTempDeviceId1] = useState('');
  const [tempDeviceId2, setTempDeviceId2] = useState('');
  const [powerDeviceId, setPowerDeviceId] = useState('');
  const [customProxyUrl, setCustomProxyUrl] = useState('');

  // Custom Device Names & Locations state
  const [tempName1, setTempName1] = useState('');
  const [tempLoc1, setTempLoc1] = useState('');
  const [tempName2, setTempName2] = useState('');
  const [tempLoc2, setTempLoc2] = useState('');
  const [powerName, setPowerName] = useState('');
  const [powerLoc, setPowerLoc] = useState('');

  // Custom DP codes mapping state
  const [tempCode1, setTempCode1] = useState('va_temperature');
  const [humCode1, setHumCode1] = useState('va_humidity');
  const [tempCode2, setTempCode2] = useState('va_temperature');
  const [humCode2, setHumCode2] = useState('va_humidity');
  const [powerCode, setPowerCode] = useState('cur_power');
  const [voltageCode, setVoltageCode] = useState('cur_voltage');
  const [currentCode, setCurrentCode] = useState('cur_current');
  const [energyCode, setEnergyCode] = useState('add_ele');

  // Status indicators
  const [tuyaStatus, setTuyaStatus] = useState<'idle' | 'testing' | 'success' | 'error'>('idle');
  const [tuyaErrorMsg, setTuyaErrorMsg] = useState('');
  const [saveStatus, setSaveStatus] = useState<'idle' | 'saving' | 'saved'>('idle');

  // Recalculate yesterday's energy stats utility
  const [recalcStatus, setRecalcStatus] = useState<'idle' | 'running' | 'success' | 'error'>('idle');
  const [recalcMsg, setRecalcMsg] = useState('');

  const handleRecalculateYesterday = async () => {
    setRecalcStatus('running');
    setRecalcMsg('Fetching yesterday\'s logs...');
    try {
      const config = await getTuyaConfig();
      if (!config || !config.powerDeviceId) {
        throw new Error("Power meter is not configured in Settings.");
      }

      const user = auth.currentUser;
      if (!user) {
        throw new Error("You must be logged in to sync to Firestore.");
      }

      // Calculate Yesterday's Belgrade date and timestamps
      const now = new Date();
      
      // Determine Belgrade time offset dynamically to handle DST
      const belgradeTimeStr = now.toLocaleString('en-US', { timeZone: 'Europe/Belgrade' });
      const belgradeOffsetMs = new Date(belgradeTimeStr).getTime() - now.getTime();
      
      // Get midnight local Belgrade time today
      const localDateStr = new Intl.DateTimeFormat('en-US', {
        timeZone: 'Europe/Belgrade',
        year: 'numeric',
        month: '2-digit',
        day: '2-digit'
      }).format(now);
      const [month, day, year] = localDateStr.split('/');
      const todayLocal = new Date(`${year}-${month}-${day}T00:00:00`);
      
      // Get UTC timestamps for Belgrade midnight yesterday and Belgrade midnight today
      const midnightTodayUtc = todayLocal.getTime() - belgradeOffsetMs;
      const midnightYesterdayUtc = midnightTodayUtc - 24 * 60 * 60 * 1000;
      
      const yesterdayDateStr = new Date(midnightYesterdayUtc + belgradeOffsetMs).toISOString().split('T')[0];
      setRecalcMsg(`Fetching logs for ${yesterdayDateStr} (Belgrade local time)...`);

      // Fetch logs of add_ele (energy increments) since yesterday midnight
      const eCode = config.energyCode || 'add_ele';
      
      // We will paginate to make sure we fetch all logs (up to 5 pages, 500 logs)
      let allLogs: any[] = [];
      let lastRowKey = '';
      let hasMore = true;
      let pageCount = 0;
      
      while (hasMore && pageCount < 5) {
        const rowKeyParam = lastRowKey ? `&last_row_key=${encodeURIComponent(lastRowKey)}` : '';
        const path = `/v2.0/cloud/thing/${config.powerDeviceId}/report-logs?codes=${eCode}&start_time=${midnightYesterdayUtc}&end_time=${midnightTodayUtc}&size=100${rowKeyParam}`;
        const res = await makeTuyaRequest(path, 'GET');
        
        if (!res || !res.success) {
          throw new Error(res?.msg || "Failed to fetch logs from Tuya API.");
        }
        
        const pageLogs = res.result?.logs || [];
        allLogs = allLogs.concat(pageLogs);
        hasMore = res.result?.has_more || false;
        lastRowKey = res.result?.last_row_key || '';
        pageCount++;
        
        if (pageLogs.length === 0 || !lastRowKey) {
          break;
        }
      }

      if (allLogs.length === 0) {
        throw new Error(`No energy logs found for ${yesterdayDateStr}.`);
      }

      setRecalcMsg(`Grouping ${allLogs.length} logs and writing to Firestore...`);

      // Group date logs by Belgrade hour
      const hourlyKwh = new Array(24).fill(0);
      allLogs.forEach(log => {
        const logLocalTime = new Date(Number(log.event_time) + belgradeOffsetMs);
        const hour = logLocalTime.getUTCHours();
        if (hour >= 0 && hour < 24) {
          hourlyKwh[hour] += Number(log.value) || 0;
        }
      });

      // Divide by 1000 scale
      for (let h = 0; h < 24; h++) {
        hourlyKwh[h] = Number((hourlyKwh[h] / 1000).toFixed(3));
      }

      const totalKwh = Number(hourlyKwh.reduce((a, b) => a + b, 0).toFixed(2));
      
      // Cost: Belgrade High/Low Tariff
      let cost = 0;
      for (let h = 0; h < 24; h++) {
        const hKwh = hourlyKwh[h];
        if (h >= 0 && h < 8) {
          cost += hKwh * 4.15;
        } else {
          cost += hKwh * 13.45;
        }
      }
      cost = Number(cost.toFixed(2));
      const peakKw = Number((Math.max(...hourlyKwh) * 4).toFixed(1));

      // Save merged record to Firestore
      const docRef = doc(db, 'artifacts', 'smart-home-apps', 'users', user.uid, 'energyHistory', yesterdayDateStr);
      await setDoc(docRef, {
        kwh: totalKwh,
        peakKw,
        cost,
        hourly: hourlyKwh,
        last_readings: new Array(24).fill(0),
        start_val: 0
      });

      setRecalcStatus('success');
      setRecalcMsg(`Successfully recalculated ${yesterdayDateStr}: ${totalKwh} kWh (${allLogs.length} logs, cost: ${cost} RSD)`);
    } catch (err: any) {
      console.error(err);
      setRecalcStatus('error');
      setRecalcMsg(err.message || 'An unexpected error occurred.');
    }
  };

  // Load configurations on mount
  useEffect(() => {
    const loadConfigs = async () => {
      const tuya = await getTuyaConfig();
      if (tuya) {
        setClientId(tuya.clientId || '');
        setClientSecret(tuya.clientSecret || '');
        setRegion(tuya.region || 'us');
        setTempDeviceId1(tuya.tempDeviceId1 || '');
        setTempDeviceId2(tuya.tempDeviceId2 || '');
        setPowerDeviceId(tuya.powerDeviceId || '');
        setCustomProxyUrl(tuya.customProxyUrl || '');

        setTempName1(tuya.tempName1 || '');
        setTempLoc1(tuya.tempLoc1 || '');
        setTempName2(tuya.tempName2 || '');
        setTempLoc2(tuya.tempLoc2 || '');
        setPowerName(tuya.powerName || '');
        setPowerLoc(tuya.powerLoc || '');

        if (tuya.tempCode1) setTempCode1(tuya.tempCode1);
        if (tuya.humCode1) setHumCode1(tuya.humCode1);
        if (tuya.tempCode2) setTempCode2(tuya.tempCode2);
        if (tuya.humCode2) setHumCode2(tuya.humCode2);
        if (tuya.powerCode) setPowerCode(tuya.powerCode);
        if (tuya.voltageCode) setVoltageCode(tuya.voltageCode);
        if (tuya.currentCode) setCurrentCode(tuya.currentCode);
        if (tuya.energyCode) setEnergyCode(tuya.energyCode);
      }
    };
    loadConfigs();
  }, []);

  // Save Tuya config
  const handleSaveTuya = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaveStatus('saving');
    
    const config: TuyaConfig = {
      clientId: clientId.trim(),
      clientSecret: clientSecret.trim(),
      region,
      tempDeviceId1: tempDeviceId1.trim(),
      tempDeviceId2: tempDeviceId2.trim(),
      powerDeviceId: powerDeviceId.trim(),
      customProxyUrl: customProxyUrl.trim(),
      tempCode1: tempCode1.trim(),
      humCode1: humCode1.trim(),
      tempCode2: tempCode2.trim(),
      humCode2: humCode2.trim(),
      powerCode: powerCode.trim(),
      voltageCode: voltageCode.trim(),
      currentCode: currentCode.trim(),
      energyCode: energyCode.trim(),
      tempName1: tempName1.trim(),
      tempLoc1: tempLoc1.trim(),
      tempName2: tempName2.trim(),
      tempLoc2: tempLoc2.trim(),
      powerName: powerName.trim(),
      powerLoc: powerLoc.trim()
    };

    try {
      await saveTuyaConfig(config);
      clearTokenCache(); // Reset cached tokens in case credentials changed
      setSaveStatus('saved');
      setTimeout(() => setSaveStatus('idle'), 3000);
    } catch (e) {
      console.error(e);
      setSaveStatus('idle');
      alert("Failed to save configuration.");
    }
  };

  // Test Tuya Connection
  const handleTestConnection = async () => {
    if (!clientId || !clientSecret) {
      setTuyaStatus('error');
      setTuyaErrorMsg('Please fill in both Client ID and Client Secret first.');
      return;
    }

    setTuyaStatus('testing');
    setTuyaErrorMsg('');
    setDiagResult(null);

    const tempConfig: TuyaConfig = {
      clientId: clientId.trim(),
      clientSecret: clientSecret.trim(),
      region,
      tempDeviceId1: tempDeviceId1.trim(),
      tempDeviceId2: tempDeviceId2.trim(),
      powerDeviceId: powerDeviceId.trim(),
      customProxyUrl: customProxyUrl.trim(),
      tempCode1: tempCode1.trim(),
      humCode1: humCode1.trim(),
      tempCode2: tempCode2.trim(),
      humCode2: humCode2.trim(),
      powerCode: powerCode.trim(),
      voltageCode: voltageCode.trim(),
      currentCode: currentCode.trim(),
      energyCode: energyCode.trim(),
      tempName1: tempName1.trim(),
      tempLoc1: tempLoc1.trim(),
      tempName2: tempName2.trim(),
      tempLoc2: tempLoc2.trim(),
      powerName: powerName.trim(),
      powerLoc: powerLoc.trim()
    };

    const res = await testFullConnection(tempConfig);
    setDiagResult(res);

    const hasDevices = tempConfig.tempDeviceId1 || tempConfig.tempDeviceId2 || tempConfig.powerDeviceId;
    const allDevicesOk = 
      (!tempConfig.tempDeviceId1 || res.devices.temp1.success) &&
      (!tempConfig.tempDeviceId2 || res.devices.temp2.success) &&
      (!tempConfig.powerDeviceId || res.devices.power.success);

    if (res.token && (!hasDevices || allDevicesOk)) {
      setTuyaStatus('success');
    } else {
      setTuyaStatus('error');
      setTuyaErrorMsg(res.tokenError || 'One or more device checks failed. See diagnostics checklist below.');
    }
  };

  return (
    <div className="settings-view animate-fade-in">
      <section className="page-header" aria-label="Page Title">
        <div className="title-group">
          <h2>Application Settings</h2>
          <p>Configure your Tuya IoT API access keys, device identifiers, and custom descriptions.</p>
        </div>
        <div className="connection-badges">
          <span className="status-badge success">
            <Database size={12} />
            <span>Firestore Sync Active</span>
          </span>
        </div>
      </section>

      {/* Main Settings Form wrapping all controls */}
      <form onSubmit={handleSaveTuya} className="settings-form" style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
        <div className="settings-grid" style={{ display: 'grid', gridTemplateColumns: '1fr', gap: '24px' }}>
          
          {/* Tuya Credentials Form (Collapsible) */}
          <section className="dashboard-card glass" aria-labelledby="tuya-config-title">
            <div 
              className="card-header" 
              onClick={() => setTuyaExpanded(!tuyaExpanded)}
              style={{ cursor: 'pointer', display: 'flex', justifyContent: 'space-between', alignItems: 'center', userSelect: 'none' }}
            >
              <div className="card-title-group" style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                <Key className="card-icon text-accent" />
                <h3 id="tuya-config-title" style={{ margin: 0 }}>Tuya IoT Platform API & Device Settings</h3>
              </div>
              <div className="text-muted" style={{ display: 'flex', alignItems: 'center' }}>
                {tuyaExpanded ? <ChevronUp size={20} /> : <ChevronDown size={20} />}
              </div>
            </div>
            
            {tuyaExpanded && (
              <div className="card-body" style={{ display: 'flex', flexDirection: 'column', gap: '16px', marginTop: '16px', borderTop: '1px solid var(--color-border)', paddingTop: '16px' }}>
                <div className="form-grid-2">
                  <div className="input-group">
                    <label htmlFor="client-id" style={{ display: 'block', fontSize: '12px', fontWeight: 600, marginBottom: '6px', color: 'var(--color-text-muted)' }}>
                      Access ID / Client ID
                    </label>
                    <input 
                      type="text" 
                      id="client-id"
                      value={clientId} 
                      onChange={(e) => setClientId(e.target.value)} 
                      required
                      style={{ width: '100%', padding: '10px', borderRadius: '6px', border: '1px solid var(--color-border)', backgroundColor: 'var(--color-hover-bg)', color: 'var(--color-text)' }}
                    />
                  </div>

                  <div className="input-group">
                    <label htmlFor="region-select" style={{ display: 'block', fontSize: '12px', fontWeight: 600, marginBottom: '6px', color: 'var(--color-text-muted)' }}>
                      Regional Gateway Region
                    </label>
                    <select 
                      id="region-select"
                      value={region} 
                      onChange={(e) => setRegion(e.target.value as any)}
                      style={{ width: '100%', padding: '10px', borderRadius: '6px', border: '1px solid var(--color-border)', backgroundColor: 'var(--color-hover-bg)', color: 'var(--color-text)' }}
                    >
                      <option value="us">America (openapi.tuyaus.com)</option>
                      <option value="eu">Europe Central (openapi.tuyaeu.com)</option>
                      <option value="eu-west">Europe West (openapi-weaz.tuyaeu.com)</option>
                      <option value="cn">China (openapi.tuyacn.com)</option>
                      <option value="in">India (openapi.tuyain.com)</option>
                    </select>
                  </div>
                </div>

                <div className="input-group">
                  <label htmlFor="client-secret" style={{ display: 'block', fontSize: '12px', fontWeight: 600, marginBottom: '6px', color: 'var(--color-text-muted)' }}>
                    Access Key / Client Secret
                  </label>
                  <input 
                    type="password" 
                    id="client-secret"
                    value={clientSecret} 
                    onChange={(e) => setClientSecret(e.target.value)} 
                    required
                    style={{ width: '100%', padding: '10px', borderRadius: '6px', border: '1px solid var(--color-border)', backgroundColor: 'var(--color-hover-bg)', color: 'var(--color-text)' }}
                  />
                </div>

                <div className="input-group" style={{ border: '1px dashed var(--color-border)', padding: '16px', borderRadius: '8px', backgroundColor: 'rgba(255,255,255,0.01)', marginTop: '8px' }}>
                  <label htmlFor="custom-proxy" style={{ display: 'block', fontSize: '12px', fontWeight: 600, marginBottom: '6px', color: 'var(--color-primary)' }}>
                    Custom CORS Proxy URL (Optional, but Recommended for Production)
                  </label>
                  <input 
                    type="url" 
                    id="custom-proxy"
                    placeholder="https://your-proxy.your-username.workers.dev"
                    value={customProxyUrl} 
                    onChange={(e) => setCustomProxyUrl(e.target.value)} 
                    style={{ width: '100%', padding: '10px', borderRadius: '6px', border: '1px solid var(--color-border)', backgroundColor: 'var(--color-hover-bg)', color: 'var(--color-text)', fontSize: '13px', marginBottom: '10px' }}
                  />
                  <p style={{ margin: 0, fontSize: '11px', color: 'var(--color-text-muted)', lineHeight: '1.5' }}>
                    <strong>Why use this?</strong> Public proxies (like corsproxy.io) strip headers with underscores (e.g. <code>client_id</code>), which causes the Tuya API to reject requests in production. Setting up a private Cloudflare Worker resolves this and ensures your credentials remain secure.
                  </p>
                  
                  {/* Collapsible Cloudflare Worker Deployment Guide */}
                  <details style={{ marginTop: '10px' }}>
                    <summary style={{ cursor: 'pointer', fontSize: '11px', fontWeight: 600, color: 'var(--color-accent)', userSelect: 'none' }}>
                      Show 2-Minute Setup Instructions
                    </summary>
                    <div style={{ marginTop: '10px', padding: '12px', borderRadius: '6px', backgroundColor: 'rgba(0,0,0,0.2)', border: '1px solid var(--color-border)', fontSize: '11px', color: 'var(--color-text)', lineHeight: '1.6' }}>
                      <ol style={{ paddingLeft: '16px', margin: '0 0 12px 0' }}>
                        <li>Sign up for a free account at <a href="https://dash.cloudflare.com" target="_blank" rel="noreferrer" style={{ color: 'var(--color-accent)', textDecoration: 'underline' }}>dash.cloudflare.com</a>.</li>
                        <li>Go to <strong>Workers & Pages</strong> &gt; <strong>Create Worker</strong>. Name it (e.g. <code>tuya-cors-proxy</code>).</li>
                        <li>Click <strong>Deploy</strong>, then click <strong>Edit Code</strong>.</li>
                        <li>Replace the default code with the script below, click <strong>Save and Deploy</strong>, and paste your Worker URL above!</li>
                      </ol>
                      <pre style={{ margin: 0, padding: '8px', borderRadius: '4px', backgroundColor: 'var(--color-hover-bg)', border: '1px solid var(--color-border)', overflowX: 'auto', fontSize: '10px', color: 'var(--color-accent)' }}>
{`addEventListener('fetch', event => {
  event.respondWith(handleRequest(event.request))
})

async function handleRequest(request) {
  const url = new URL(request.url)
  const targetUrl = url.searchParams.get('url')
  if (!targetUrl) return new Response('Missing ?url= parameter', { status: 400 })

  if (request.method === 'OPTIONS') {
    return new Response(null, {
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Headers': '*',
        'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
        'Access-Control-Max-Age': '86400',
      }
    })
  }

  const forwardHeaders = new Headers()
  for (const [key, value] of request.headers.entries()) {
    if (key.toLowerCase() !== 'host' && key.toLowerCase() !== 'origin') {
      forwardHeaders.set(key, value)
    }
  }

  try {
    const response = await fetch(targetUrl, {
      method: request.method,
      headers: forwardHeaders,
      body: request.method !== 'GET' && request.method !== 'HEAD' ? await request.arrayBuffer() : null
    })
    const responseHeaders = new Headers(response.headers)
    responseHeaders.set('Access-Control-Allow-Origin', '*')
    responseHeaders.set('Access-Control-Allow-Headers', '*')
    responseHeaders.set('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS')
    return new Response(response.body, { status: response.status, headers: responseHeaders })
  } catch (err) {
    return new Response('Proxy Error: ' + err.message, { status: 500 })
  }
}`}
                      </pre>
                    </div>
                  </details>
                </div>

                <div style={{ borderTop: '1px solid var(--color-border)', paddingTop: '16px' }}>
                  <h4 style={{ fontSize: '13px', fontWeight: 600, marginBottom: '12px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <Cpu size={14} className="text-primary" />
                    <span>Device Identifiers & Custom Labels</span>
                  </h4>

                  <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                    {/* Device 1 details */}
                    <div style={{ border: '1px solid var(--color-border)', padding: '12px', borderRadius: '8px', backgroundColor: 'rgba(255,255,255,0.02)' }}>
                      <label htmlFor="temp-dev-1" style={{ display: 'block', fontSize: '11px', fontWeight: 700, marginBottom: '6px', textTransform: 'uppercase', color: 'var(--color-primary)' }}>
                        Temperature Monitor 1
                      </label>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                        <input 
                          type="text" 
                          id="temp-dev-1"
                          placeholder="Device ID (e.g. 8835072084f3ebb4d2d4)"
                          value={tempDeviceId1} 
                          onChange={(e) => setTempDeviceId1(e.target.value)} 
                          style={{ width: '100%', padding: '8px', borderRadius: '6px', border: '1px solid var(--color-border)', backgroundColor: 'var(--color-hover-bg)', color: 'var(--color-text)', fontSize: '13px' }}
                        />
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
                          <input 
                            type="text" 
                            placeholder="Custom Sensor Name (e.g. Living Room)"
                            value={tempName1}
                            onChange={(e) => setTempName1(e.target.value)}
                            style={{ padding: '8px', borderRadius: '6px', border: '1px solid var(--color-border)', backgroundColor: 'var(--color-hover-bg)', color: 'var(--color-text)', fontSize: '12px' }}
                          />
                          <input 
                            type="text" 
                            placeholder="Location description (e.g. Main Floor)"
                            value={tempLoc1}
                            onChange={(e) => setTempLoc1(e.target.value)}
                            style={{ padding: '8px', borderRadius: '6px', border: '1px solid var(--color-border)', backgroundColor: 'var(--color-hover-bg)', color: 'var(--color-text)', fontSize: '12px' }}
                          />
                        </div>
                      </div>
                    </div>

                    {/* Device 2 details */}
                    <div style={{ border: '1px solid var(--color-border)', padding: '12px', borderRadius: '8px', backgroundColor: 'rgba(255,255,255,0.02)' }}>
                      <label htmlFor="temp-dev-2" style={{ display: 'block', fontSize: '11px', fontWeight: 700, marginBottom: '6px', textTransform: 'uppercase', color: 'var(--color-primary)' }}>
                        Temperature Monitor 2
                      </label>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                        <input 
                          type="text" 
                          id="temp-dev-2"
                          placeholder="Device ID (e.g. 8835072084f3ebb4df89)"
                          value={tempDeviceId2} 
                          onChange={(e) => setTempDeviceId2(e.target.value)} 
                          style={{ width: '100%', padding: '8px', borderRadius: '6px', border: '1px solid var(--color-border)', backgroundColor: 'var(--color-hover-bg)', color: 'var(--color-text)', fontSize: '13px' }}
                        />
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
                          <input 
                            type="text" 
                            placeholder="Custom Sensor Name (e.g. Greenhouse)"
                            value={tempName2}
                            onChange={(e) => setTempName2(e.target.value)}
                            style={{ padding: '8px', borderRadius: '6px', border: '1px solid var(--color-border)', backgroundColor: 'var(--color-hover-bg)', color: 'var(--color-text)', fontSize: '12px' }}
                          />
                          <input 
                            type="text" 
                            placeholder="Location description (e.g. Backyard Garden)"
                            value={tempLoc2}
                            onChange={(e) => setTempLoc2(e.target.value)}
                            style={{ padding: '8px', borderRadius: '6px', border: '1px solid var(--color-border)', backgroundColor: 'var(--color-hover-bg)', color: 'var(--color-text)', fontSize: '12px' }}
                          />
                        </div>
                      </div>
                    </div>

                    {/* Power meter details */}
                    <div style={{ border: '1px solid var(--color-border)', padding: '12px', borderRadius: '8px', backgroundColor: 'rgba(255,255,255,0.02)' }}>
                      <label htmlFor="power-dev" style={{ display: 'block', fontSize: '11px', fontWeight: 700, marginBottom: '6px', textTransform: 'uppercase', color: 'var(--color-accent)' }}>
                        Smart Power Meter
                      </label>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                        <input 
                          type="text" 
                          id="power-dev"
                          placeholder="Device ID (e.g. 8835072084f3ebb45612)"
                          value={powerDeviceId} 
                          onChange={(e) => setPowerDeviceId(e.target.value)} 
                          style={{ width: '100%', padding: '8px', borderRadius: '6px', border: '1px solid var(--color-border)', backgroundColor: 'var(--color-hover-bg)', color: 'var(--color-text)', fontSize: '13px' }}
                        />
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
                          <input 
                            type="text" 
                            placeholder="Custom Meter Name (e.g. Main Grid Meter)"
                            value={powerName}
                            onChange={(e) => setPowerName(e.target.value)}
                            style={{ padding: '8px', borderRadius: '6px', border: '1px solid var(--color-border)', backgroundColor: 'var(--color-hover-bg)', color: 'var(--color-text)', fontSize: '12px' }}
                          />
                          <input 
                            type="text" 
                            placeholder="Grid description (e.g. Main Connection)"
                            value={powerLoc}
                            onChange={(e) => setPowerLoc(e.target.value)}
                            style={{ padding: '8px', borderRadius: '6px', border: '1px solid var(--color-border)', backgroundColor: 'var(--color-hover-bg)', color: 'var(--color-text)', fontSize: '12px' }}
                          />
                        </div>
                      </div>
                    </div>
                  </div>
                </div>

                <div className="form-buttons" style={{ display: 'flex', gap: '12px', marginTop: '12px' }}>
                  <button 
                    type="button" 
                    id="btn-test-tuya-connection"
                    onClick={handleTestConnection} 
                    className="btn secondary"
                    style={{ display: 'flex', gap: '8px', alignItems: 'center', flex: 1, justifyContent: 'center' }}
                  >
                    {tuyaStatus === 'testing' && <RefreshCw size={14} className="animate-spin" />}
                    <span>Test Connection Diagnostics</span>
                  </button>
                </div>

                {/* Test Status Feedback */}
                {tuyaStatus === 'success' && (
                  <div className="alert-banner success" style={{ backgroundColor: 'rgba(16, 185, 129, 0.1)', borderColor: 'rgba(16, 185, 129, 0.2)', color: 'var(--color-secondary)' }}>
                    <CheckCircle2 size={16} />
                    <span><strong>Connection Verified:</strong> Successfully authenticated!</span>
                  </div>
                )}
                {tuyaStatus === 'error' && (
                  <div className="alert-banner warning" style={{ backgroundColor: 'rgba(244, 63, 94, 0.1)', borderColor: 'rgba(244, 63, 94, 0.2)', color: 'var(--color-danger)' }}>
                    <XCircle size={16} />
                    <span><strong>Test Failed:</strong> {tuyaErrorMsg}</span>
                  </div>
                )}
                
                {diagResult && (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', padding: '12px', borderRadius: '6px', backgroundColor: 'var(--color-hover-bg)', border: '1px solid var(--color-border)', fontSize: '13px' }}>
                    <h4 style={{ fontSize: '13px', fontWeight: 700, borderBottom: '1px solid var(--color-border)', paddingBottom: '4px', marginBottom: '4px' }}>
                      Device Connection Diagnostics:
                    </h4>
                    
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <span className={diagResult.token ? 'text-success' : 'text-danger'} style={{ fontWeight: 'bold' }}>
                        {diagResult.token ? '✓' : '✗'}
                      </span>
                      <span>API Auth Token Handshake</span>
                      {diagResult.tokenError && <span style={{ fontSize: '11px', color: 'var(--color-danger)' }}>({diagResult.tokenError})</span>}
                    </div>

                    {tempDeviceId1 && (
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <span className={diagResult.devices.temp1.success ? 'text-success' : 'text-danger'} style={{ fontWeight: 'bold' }}>
                          {diagResult.devices.temp1.success ? '✓' : '✗'}
                        </span>
                        <span>Temp 1 (ID: ...{tempDeviceId1.slice(-6)}): {diagResult.devices.temp1.msg}</span>
                      </div>
                    )}

                    {tempDeviceId2 && (
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <span className={diagResult.devices.temp2.success ? 'text-success' : 'text-danger'} style={{ fontWeight: 'bold' }}>
                          {diagResult.devices.temp2.success ? '✓' : '✗'}
                        </span>
                        <span>Temp 2 (ID: ...{tempDeviceId2.slice(-6)}): {diagResult.devices.temp2.msg}</span>
                      </div>
                    )}

                    {powerDeviceId && (
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <span className={diagResult.devices.power.success ? 'text-success' : 'text-danger'} style={{ fontWeight: 'bold' }}>
                          {diagResult.devices.power.success ? '✓' : '✗'}
                        </span>
                        <span>Power Meter (ID: ...{powerDeviceId.slice(-6)}): {diagResult.devices.power.msg}</span>
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}
          </section>

          {/* Firebase Sync Settings & Custom Codes */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
            
            {/* Firebase Cloud Sync Status (Collapsible) */}
            <section className="dashboard-card glass" aria-labelledby="firebase-config-title">
              <div 
                className="card-header" 
                onClick={() => setBackupExpanded(!backupExpanded)}
                style={{ cursor: 'pointer', display: 'flex', justifyContent: 'space-between', alignItems: 'center', userSelect: 'none' }}
              >
                <div className="card-title-group" style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                  <Cloud className="card-icon text-primary" />
                  <h3 id="firebase-config-title" style={{ margin: 0 }}>Google Cloud Backup & Sync</h3>
                </div>
                <div className="text-muted" style={{ display: 'flex', alignItems: 'center' }}>
                  {backupExpanded ? <ChevronUp size={20} /> : <ChevronDown size={20} />}
                </div>
              </div>
              
              {backupExpanded && (
                <div className="card-body" style={{ display: 'flex', flexDirection: 'column', gap: '16px', marginTop: '16px', borderTop: '1px solid var(--color-border)', paddingTop: '16px' }}>
                  <div className="alert-banner success" style={{ backgroundColor: 'rgba(16, 185, 129, 0.1)', borderColor: 'rgba(16, 185, 129, 0.2)', color: 'var(--color-secondary)', margin: 0 }}>
                    <CheckCircle2 size={16} />
                    <span>Firestore Sync is fully operational.</span>
                  </div>

                  <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', fontSize: '13px' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 0', borderBottom: '1px solid var(--color-border)' }}>
                      <span style={{ color: 'var(--color-text-muted)' }}>Backup Account</span>
                      <span style={{ fontWeight: 600 }}>{auth.currentUser?.email || 'N/A'}</span>
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 0', borderBottom: '1px solid var(--color-border)' }}>
                      <span style={{ color: 'var(--color-text-muted)' }}>Sync Directory</span>
                      <span style={{ fontFamily: 'monospace', fontSize: '11px' }}>artifacts/smart-home-apps/users/{auth.currentUser?.uid?.slice(0, 8)}.../settings</span>
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 0' }}>
                      <span style={{ color: 'var(--color-text-muted)' }}>Project ID</span>
                      <span style={{ fontWeight: 600 }}>gen-lang-client-0142372615</span>
                    </div>
                  </div>

                  <p style={{ fontSize: '11px', color: 'var(--color-text-muted)', lineHeight: '1.4' }}>
                    *Your Tuya device configurations are automatically synced to Google Cloud Firestore under your profile key whenever you save changes.
                  </p>
                </div>
              )}
            </section>

            {/* History & Database Utilities */}
            <section className="dashboard-card glass" aria-labelledby="db-utils-title">
              <div className="card-header" style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                <Database className="card-icon text-info" style={{ color: '#06b6d4' }} />
                <h3 id="db-utils-title" style={{ margin: 0 }}>History & Database Utilities</h3>
              </div>
              <div className="card-body" style={{ display: 'flex', flexDirection: 'column', gap: '16px', marginTop: '16px', borderTop: '1px solid var(--color-border)', paddingTop: '16px' }}>
                <p style={{ fontSize: '12px', color: 'var(--color-text-muted)', margin: 0, lineHeight: '1.4' }}>
                  Use these tools to manually repair or synchronize your historical statistics stored in Firestore.
                </p>

                <div style={{ display: 'flex', gap: '12px', alignItems: 'center', flexWrap: 'wrap' }}>
                  <button 
                    type="button" 
                    onClick={handleRecalculateYesterday} 
                    className="btn secondary"
                    disabled={recalcStatus === 'running'}
                    style={{ fontSize: '13px', padding: '8px 16px', minWidth: '220px' }}
                  >
                    {recalcStatus === 'running' && <RefreshCw size={14} className="animate-spin" style={{ marginRight: '8px', display: 'inline' }} />}
                    Recalculate Yesterday's Energy
                  </button>
                  <span style={{ fontSize: '11px', color: 'var(--color-text-muted)' }}>
                    Queries logs from Belgrade midnight to midnight and rewrites the record in Firestore.
                  </span>
                </div>

                {recalcStatus !== 'idle' && (
                  <div className={`alert-banner ${recalcStatus === 'success' ? 'success' : recalcStatus === 'error' ? 'warning' : 'info'}`} style={{ 
                    backgroundColor: recalcStatus === 'success' ? 'rgba(16, 185, 129, 0.1)' : recalcStatus === 'error' ? 'rgba(244, 63, 94, 0.1)' : 'rgba(59, 130, 246, 0.1)', 
                    borderColor: recalcStatus === 'success' ? 'rgba(16, 185, 129, 0.2)' : recalcStatus === 'error' ? 'rgba(244, 63, 94, 0.2)' : 'rgba(59, 130, 246, 0.2)', 
                    color: recalcStatus === 'success' ? 'var(--color-secondary)' : recalcStatus === 'error' ? 'var(--color-danger)' : 'var(--color-text)',
                    margin: 0
                  }}>
                    {recalcStatus === 'success' && <CheckCircle2 size={16} />}
                    {recalcStatus === 'error' && <XCircle size={16} />}
                    {recalcStatus === 'running' && <RefreshCw size={16} className="animate-spin" />}
                    <span>{recalcMsg}</span>
                  </div>
                )}
              </div>
            </section>

            {/* Data Point (DP) Codes Config (Collapsible) */}
            <section className="dashboard-card glass" aria-labelledby="dp-config-title">
              <div 
                className="card-header" 
                onClick={() => setDpExpanded(!dpExpanded)}
                style={{ cursor: 'pointer', display: 'flex', justifyContent: 'space-between', alignItems: 'center', userSelect: 'none' }}
              >
                <div className="card-title-group" style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                  <Server className="card-icon text-warning" />
                  <h3 id="dp-config-title" style={{ margin: 0 }}>Device Register DP Codes</h3>
                </div>
                <div className="text-muted" style={{ display: 'flex', alignItems: 'center' }}>
                  {dpExpanded ? <ChevronUp size={20} /> : <ChevronDown size={20} />}
                </div>
              </div>
              
              {dpExpanded && (
                <div className="card-body" style={{ display: 'flex', flexDirection: 'column', gap: '10px', fontSize: '12px', marginTop: '16px', borderTop: '1px solid var(--color-border)', paddingTop: '16px' }}>
                  <p style={{ color: 'var(--color-text-muted)', fontSize: '11px', marginBottom: '8px' }}>
                    Tuya devices communicate using custom code parameters (Data Points). Adjust these if your sensor registers differ from defaults.
                  </p>
                  
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
                    <div className="input-group">
                      <label htmlFor="temp-code-1" style={{ color: 'var(--color-text-muted)', fontSize: '10px', display: 'block', marginBottom: '4px' }}>Temp Code (S1)</label>
                      <input type="text" id="temp-code-1" value={tempCode1} onChange={(e) => setTempCode1(e.target.value)} style={{ width: '100%', padding: '6px 8px', border: '1px solid var(--color-border)', borderRadius: '4px', backgroundColor: 'var(--color-hover-bg)', color: 'var(--color-text)' }} />
                    </div>
                    <div className="input-group">
                      <label htmlFor="hum-code-1" style={{ color: 'var(--color-text-muted)', fontSize: '10px', display: 'block', marginBottom: '4px' }}>Humidity Code (S1)</label>
                      <input type="text" id="hum-code-1" value={humCode1} onChange={(e) => setHumCode1(e.target.value)} style={{ width: '100%', padding: '6px 8px', border: '1px solid var(--color-border)', borderRadius: '4px', backgroundColor: 'var(--color-hover-bg)', color: 'var(--color-text)' }} />
                    </div>
                    <div className="input-group">
                      <label htmlFor="temp-code-2" style={{ color: 'var(--color-text-muted)', fontSize: '10px', display: 'block', marginBottom: '4px' }}>Temp Code (S2)</label>
                      <input type="text" id="temp-code-2" value={tempCode2} onChange={(e) => setTempCode2(e.target.value)} style={{ width: '100%', padding: '6px 8px', border: '1px solid var(--color-border)', borderRadius: '4px', backgroundColor: 'var(--color-hover-bg)', color: 'var(--color-text)' }} />
                    </div>
                    <div className="input-group">
                      <label htmlFor="hum-code-2" style={{ color: 'var(--color-text-muted)', fontSize: '10px', display: 'block', marginBottom: '4px' }}>Humidity Code (S2)</label>
                      <input type="text" id="hum-code-2" value={humCode2} onChange={(e) => setHumCode2(e.target.value)} style={{ width: '100%', padding: '6px 8px', border: '1px solid var(--color-border)', borderRadius: '4px', backgroundColor: 'var(--color-hover-bg)', color: 'var(--color-text)' }} />
                    </div>
                  </div>

                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 1fr', gap: '6px', marginTop: '6px' }}>
                    <div>
                      <label htmlFor="power-code" style={{ color: 'var(--color-text-muted)', fontSize: '9px', display: 'block', marginBottom: '4px' }}>Power (W)</label>
                      <input type="text" id="power-code" value={powerCode} onChange={(e) => setPowerCode(e.target.value)} style={{ width: '100%', padding: '4px 6px', border: '1px solid var(--color-border)', borderRadius: '4px', backgroundColor: 'var(--color-hover-bg)', color: 'var(--color-text)', fontSize: '11px' }} />
                    </div>
                    <div>
                      <label htmlFor="voltage-code" style={{ color: 'var(--color-text-muted)', fontSize: '9px', display: 'block', marginBottom: '4px' }}>Voltage (V)</label>
                      <input type="text" id="voltage-code" value={voltageCode} onChange={(e) => setVoltageCode(e.target.value)} style={{ width: '100%', padding: '4px 6px', border: '1px solid var(--color-border)', borderRadius: '4px', backgroundColor: 'var(--color-hover-bg)', color: 'var(--color-text)', fontSize: '11px' }} />
                    </div>
                    <div>
                      <label htmlFor="current-code" style={{ color: 'var(--color-text-muted)', fontSize: '9px', display: 'block', marginBottom: '4px' }}>Current (A)</label>
                      <input type="text" id="current-code" value={currentCode} onChange={(e) => setCurrentCode(e.target.value)} style={{ width: '100%', padding: '4px 6px', border: '1px solid var(--color-border)', borderRadius: '4px', backgroundColor: 'var(--color-hover-bg)', color: 'var(--color-text)', fontSize: '11px' }} />
                    </div>
                    <div>
                      <label htmlFor="energy-code" style={{ color: 'var(--color-text-muted)', fontSize: '9px', display: 'block', marginBottom: '4px' }}>Energy (kWh)</label>
                      <input type="text" id="energy-code" value={energyCode} onChange={(e) => setEnergyCode(e.target.value)} style={{ width: '100%', padding: '4px 6px', border: '1px solid var(--color-border)', borderRadius: '4px', backgroundColor: 'var(--color-hover-bg)', color: 'var(--color-text)', fontSize: '11px' }} />
                    </div>
                  </div>
                </div>
              )}
            </section>
          </div>
        </div>

        {/* Global Save Button (Always visible at the bottom) */}
        <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '12px', borderTop: '1px solid var(--color-border)', paddingTop: '20px' }}>
          <button 
            type="submit" 
            id="btn-save-tuya-config"
            className="btn primary" 
            style={{ padding: '12px 32px', fontSize: '15px', fontWeight: 700, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '8px', boxShadow: 'var(--glow-primary)' }}
            disabled={saveStatus === 'saving'}
          >
            {saveStatus === 'saving' ? (
              <>
                <RefreshCw size={16} className="animate-spin" />
                <span>Saving Configuration...</span>
              </>
            ) : saveStatus === 'saved' ? (
              <span>Saved Settings ✓</span>
            ) : (
              <span>Save Configuration</span>
            )}
          </button>
        </div>
      </form>
    </div>
  );
};
