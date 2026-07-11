import React, { useState, useEffect } from 'react';
import { 
  getTuyaConfig, 
  saveTuyaConfig, 
  clearTokenCache,
  testFullConnection,
  auth
} from '../utils/tuyaService';
import type { TuyaConfig } from '../utils/tuyaService';
import { 
  Cloud, 
  Key, 
  Cpu, 
  CheckCircle2, 
  XCircle, 
  RefreshCw,
  Server,
  Database
} from 'lucide-react';

export const Settings: React.FC = () => {
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

        if (tuya.tempCode1) setTempCode1(tuya.tempCode1);
        if (tuya.humCode1) setHumCode1(tuya.humCode1);
        if (tuya.tempCode2) setTempCode2(tuya.tempCode2);
        if (tuya.humCode2) setHumCode2(tuya.humCode2);
        if (tuya.powerCode) setPowerCode(tuya.powerCode);
        if (tuya.voltageCode) setVoltageCode(tuya.voltageCode);
        if (tuya.currentCode) setCurrentCode(tuya.currentCode);
        if (tuya.energyCode) setEnergyCode(tuya.energyCode);
      }

      // Firebase is active automatically since it is hardcoded and user is logged in
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
      tempCode1: tempCode1.trim(),
      humCode1: humCode1.trim(),
      tempCode2: tempCode2.trim(),
      humCode2: humCode2.trim(),
      powerCode: powerCode.trim(),
      voltageCode: voltageCode.trim(),
      currentCode: currentCode.trim(),
      energyCode: energyCode.trim(),
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
      tempCode1: tempCode1.trim(),
      humCode1: humCode1.trim(),
      tempCode2: tempCode2.trim(),
      humCode2: humCode2.trim(),
      powerCode: powerCode.trim(),
      voltageCode: voltageCode.trim(),
      currentCode: currentCode.trim(),
      energyCode: energyCode.trim(),
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

  // Firebase operations handled natively via user auth session

  return (
    <div className="settings-view animate-fade-in">
      <section className="page-header" aria-label="Page Title">
        <div className="title-group">
          <h2>Application Settings</h2>
          <p>Configure your Tuya IoT API access keys, device identifiers, and optionally sync settings via Google Firestore.</p>
        </div>
        <div className="connection-badges">
          <span className="status-badge success">
            <Database size={12} />
            <span>Firestore Sync Active</span>
          </span>
        </div>
      </section>

      <div className="settings-grid">
        
        {/* Tuya Credentials Form */}
        <section className="dashboard-card glass" aria-labelledby="tuya-config-title">
          <div className="card-header">
            <div className="card-title-group">
              <Key className="card-icon text-accent" />
              <h3 id="tuya-config-title">Tuya IoT Platform API Settings</h3>
            </div>
          </div>
          
          <form onSubmit={handleSaveTuya} className="settings-form" style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
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

            <div style={{ borderTop: '1px solid var(--color-border)', paddingTop: '16px' }}>
              <h4 style={{ fontSize: '13px', fontWeight: 600, marginBottom: '12px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                <Cpu size={14} className="text-primary" />
                <span>Device Identifiers (Device IDs)</span>
              </h4>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                <div className="input-group">
                  <label htmlFor="temp-dev-1" style={{ display: 'block', fontSize: '11px', fontWeight: 600, marginBottom: '4px', color: 'var(--color-text-muted)' }}>
                    Temperature Monitor 1 Device ID
                  </label>
                  <input 
                    type="text" 
                    id="temp-dev-1"
                    placeholder="e.g. 8835072084f3ebb4d2d4"
                    value={tempDeviceId1} 
                    onChange={(e) => setTempDeviceId1(e.target.value)} 
                    style={{ width: '100%', padding: '8px', borderRadius: '6px', border: '1px solid var(--color-border)', backgroundColor: 'var(--color-hover-bg)', color: 'var(--color-text)', fontSize: '13px' }}
                  />
                </div>

                <div className="input-group">
                  <label htmlFor="temp-dev-2" style={{ display: 'block', fontSize: '11px', fontWeight: 600, marginBottom: '4px', color: 'var(--color-text-muted)' }}>
                    Temperature Monitor 2 Device ID
                  </label>
                  <input 
                    type="text" 
                    id="temp-dev-2"
                    placeholder="e.g. 8835072084f3ebb4df89"
                    value={tempDeviceId2} 
                    onChange={(e) => setTempDeviceId2(e.target.value)} 
                    style={{ width: '100%', padding: '8px', borderRadius: '6px', border: '1px solid var(--color-border)', backgroundColor: 'var(--color-hover-bg)', color: 'var(--color-text)', fontSize: '13px' }}
                  />
                </div>

                <div className="input-group">
                  <label htmlFor="power-dev" style={{ display: 'block', fontSize: '11px', fontWeight: 600, marginBottom: '4px', color: 'var(--color-text-muted)' }}>
                    Smart Power Meter Device ID
                  </label>
                  <input 
                    type="text" 
                    id="power-dev"
                    placeholder="e.g. 8835072084f3ebb45612"
                    value={powerDeviceId} 
                    onChange={(e) => setPowerDeviceId(e.target.value)} 
                    style={{ width: '100%', padding: '8px', borderRadius: '6px', border: '1px solid var(--color-border)', backgroundColor: 'var(--color-hover-bg)', color: 'var(--color-text)', fontSize: '13px' }}
                  />
                </div>
              </div>
            </div>

            <div className="form-buttons">
              <button 
                type="submit" 
                id="btn-save-tuya-config"
                className="btn primary" 
                style={{ flex: 1 }}
                disabled={saveStatus === 'saving'}
              >
                {saveStatus === 'saving' ? 'Saving...' : saveStatus === 'saved' ? 'Settings Saved ✓' : 'Save Tuya Credentials'}
              </button>
              
              <button 
                type="button" 
                id="btn-test-tuya-connection"
                onClick={handleTestConnection} 
                className="btn secondary"
                style={{ display: 'flex', gap: '8px', alignItems: 'center' }}
              >
                {tuyaStatus === 'testing' && <RefreshCw size={14} className="animate-spin" />}
                <span>Test Connection</span>
              </button>
            </div>

            {/* Test Status Feedback */}
            {tuyaStatus === 'success' && (
              <div className="alert-banner warning" style={{ backgroundColor: 'rgba(16, 185, 129, 0.1)', borderColor: 'rgba(16, 185, 129, 0.2)', color: 'var(--color-secondary)' }}>
                <CheckCircle2 size={16} />
                <span><strong>Connection Verified:</strong> Successfully signed and authenticated credentials!</span>
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
          </form>
        </section>

        {/* Firebase Sync Settings & Custom Codes */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
          
          {/* Firebase Cloud Sync Status */}
          <section className="dashboard-card glass" aria-labelledby="firebase-config-title">
            <div className="card-header">
              <div className="card-title-group">
                <Cloud className="card-icon text-primary" />
                <h3 id="firebase-config-title">Google Cloud Backup</h3>
              </div>
            </div>
            
            <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
              <div className="alert-banner warning" style={{ backgroundColor: 'rgba(16, 185, 129, 0.1)', borderColor: 'rgba(16, 185, 129, 0.2)', color: 'var(--color-secondary)', margin: 0 }}>
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
                *Your Tuya device configurations are automatically synced to Google Cloud Firestore under your profile key whenever you click "Save Tuya Credentials".
              </p>
            </div>
          </section>

          {/* Data Point (DP) Codes Config */}
          <section className="dashboard-card glass" aria-labelledby="dp-config-title">
            <div className="card-header">
              <div className="card-title-group">
                <Server className="card-icon text-warning" />
                <h3 id="dp-config-title">Device Register DP Codes</h3>
              </div>
            </div>
            
            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', fontSize: '12px' }}>
              <p style={{ color: 'var(--color-text-muted)', fontSize: '11px', marginBottom: '8px' }}>
                Tuya devices communicate using custom code parameters (Data Points). Adjust these if your sensor registers differ from defaults.
              </p>
              
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
                <div className="input-group">
                  <label htmlFor="temp-code-1" style={{ color: 'var(--color-text-muted)', fontSize: '10px' }}>Temp Code (S1)</label>
                  <input type="text" id="temp-code-1" value={tempCode1} onChange={(e) => setTempCode1(e.target.value)} style={{ width: '100%', padding: '4px 8px', border: '1px solid var(--color-border)', borderRadius: '4px', backgroundColor: 'var(--color-hover-bg)', color: 'var(--color-text)' }} />
                </div>
                <div className="input-group">
                  <label htmlFor="hum-code-1" style={{ color: 'var(--color-text-muted)', fontSize: '10px' }}>Humidity Code (S1)</label>
                  <input type="text" id="hum-code-1" value={humCode1} onChange={(e) => setHumCode1(e.target.value)} style={{ width: '100%', padding: '4px 8px', border: '1px solid var(--color-border)', borderRadius: '4px', backgroundColor: 'var(--color-hover-bg)', color: 'var(--color-text)' }} />
                </div>
                <div className="input-group">
                  <label htmlFor="temp-code-2" style={{ color: 'var(--color-text-muted)', fontSize: '10px' }}>Temp Code (S2)</label>
                  <input type="text" id="temp-code-2" value={tempCode2} onChange={(e) => setTempCode2(e.target.value)} style={{ width: '100%', padding: '4px 8px', border: '1px solid var(--color-border)', borderRadius: '4px', backgroundColor: 'var(--color-hover-bg)', color: 'var(--color-text)' }} />
                </div>
                <div className="input-group">
                  <label htmlFor="hum-code-2" style={{ color: 'var(--color-text-muted)', fontSize: '10px' }}>Humidity Code (S2)</label>
                  <input type="text" id="hum-code-2" value={humCode2} onChange={(e) => setHumCode2(e.target.value)} style={{ width: '100%', padding: '4px 8px', border: '1px solid var(--color-border)', borderRadius: '4px', backgroundColor: 'var(--color-hover-bg)', color: 'var(--color-text)' }} />
                </div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 1fr', gap: '6px', marginTop: '6px' }}>
                <div>
                  <label htmlFor="power-code" style={{ color: 'var(--color-text-muted)', fontSize: '9px' }}>Power (W)</label>
                  <input type="text" id="power-code" value={powerCode} onChange={(e) => setPowerCode(e.target.value)} style={{ width: '100%', padding: '4px 6px', border: '1px solid var(--color-border)', borderRadius: '4px', backgroundColor: 'var(--color-hover-bg)', color: 'var(--color-text)' }} />
                </div>
                <div>
                  <label htmlFor="voltage-code" style={{ color: 'var(--color-text-muted)', fontSize: '9px' }}>Voltage (V)</label>
                  <input type="text" id="voltage-code" value={voltageCode} onChange={(e) => setVoltageCode(e.target.value)} style={{ width: '100%', padding: '4px 6px', border: '1px solid var(--color-border)', borderRadius: '4px', backgroundColor: 'var(--color-hover-bg)', color: 'var(--color-text)' }} />
                </div>
                <div>
                  <label htmlFor="current-code" style={{ color: 'var(--color-text-muted)', fontSize: '9px' }}>Current (A)</label>
                  <input type="text" id="current-code" value={currentCode} onChange={(e) => setCurrentCode(e.target.value)} style={{ width: '100%', padding: '4px 6px', border: '1px solid var(--color-border)', borderRadius: '4px', backgroundColor: 'var(--color-hover-bg)', color: 'var(--color-text)' }} />
                </div>
                <div>
                  <label htmlFor="energy-code" style={{ color: 'var(--color-text-muted)', fontSize: '9px' }}>Energy (kWh)</label>
                  <input type="text" id="energy-code" value={energyCode} onChange={(e) => setEnergyCode(e.target.value)} style={{ width: '100%', padding: '4px 6px', border: '1px solid var(--color-border)', borderRadius: '4px', backgroundColor: 'var(--color-hover-bg)', color: 'var(--color-text)' }} />
                </div>
              </div>
            </div>
          </section>
        </div>
      </div>
    </div>
  );
};
