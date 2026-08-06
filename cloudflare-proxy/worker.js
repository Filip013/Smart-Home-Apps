/**
 * Smart Home Cloudflare Worker (BFF - Backend For Frontend)
 * 
 * Features:
 * 1. GET /api/status        - Full 24h normalized sensors + power meter + TV Box power daemon
 * 2. GET /api/wear-summary  - Ultra-lightweight payload optimized for Wear OS tiles & complications
 * 3. POST /api/control      - Control Tuya devices (switches, thermostats, etc.)
 * 4. ALL /proxy             - Auto-signed Tuya & CORS proxy fallback
 */

let cachedToken = null;
let tokenExpiresAt = 0;

const EMPTY_BODY_SHA = 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855';

const REGION_DOMAINS = {
  'us': 'openapi.tuyaus.com',
  'eu': 'openapi.tuyaeu.com',
  'eu-west': 'openapi-weaz.tuyaeu.com',
  'cn': 'openapi.tuyacn.com',
  'in': 'openapi.tuyain.com'
};

// SHA-256 helper
async function sha256(message) {
  const msgBuffer = new TextEncoder().encode(message);
  const hashBuffer = await crypto.subtle.digest('SHA-256', msgBuffer);
  return Array.from(new Uint8Array(hashBuffer))
    .map(b => b.toString(16).padStart(2, '0'))
    .join('');
}

// HMAC SHA-256 helper
async function hmacSha256(key, message) {
  const encoder = new TextEncoder();
  const cryptoKey = await crypto.subtle.importKey(
    'raw',
    encoder.encode(key),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  );
  const signature = await crypto.subtle.sign('HMAC', cryptoKey, encoder.encode(message));
  return Array.from(new Uint8Array(signature))
    .map(b => b.toString(16).padStart(2, '0'))
    .join('');
}

function getTuyaDomain(region) {
  const r = region || 'eu';
  return REGION_DOMAINS[r] || REGION_DOMAINS['eu'];
}

// Fetch Tuya Access Token
async function getAccessToken(env, creds) {
  const clientId = creds?.clientId || env.TUYA_CLIENT_ID;
  const clientSecret = creds?.clientSecret || env.TUYA_CLIENT_SECRET;
  if (!clientId || !clientSecret) {
    throw new Error('Tuya Client ID or Client Secret missing from request or environment variables.');
  }

  const now = Date.now();
  if (cachedToken && tokenExpiresAt > now + 120000) {
    return cachedToken;
  }

  const t = now.toString();
  const path = '/v1.0/token?grant_type=1';
  const stringToSign = `GET\n${EMPTY_BODY_SHA}\n\n${path}`;
  const str = `${clientId}${t}${stringToSign}`;
  const sign = (await hmacSha256(clientSecret, str)).toUpperCase();

  const domain = getTuyaDomain(creds?.region || env.TUYA_REGION);
  const response = await fetch(`https://${domain}${path}`, {
    method: 'GET',
    headers: {
      'client_id': clientId,
      'sign': sign,
      't': t,
      'sign_method': 'HMAC-SHA256'
    }
  });

  if (!response.ok) {
    throw new Error(`Token request failed with status ${response.status}`);
  }

  const data = await response.json();
  if (!data.success) {
    throw new Error(`Tuya API Token Error: ${data.msg || 'Unknown error fetching token'}`);
  }

  cachedToken = data.result.access_token;
  tokenExpiresAt = now + (data.result.expire_time * 1000);
  return cachedToken;
}

// Make Signed Tuya API Request
async function makeTuyaRequest(env, path, method = 'GET', body = null, creds = null) {
  let [basePath, queryString] = path.split('?');
  
  const domain = getTuyaDomain(creds?.region || env.TUYA_REGION);
  let sortedPath = basePath;
  let fetchUrl = `https://${domain}${basePath}`; // FIX #1: Separate fetch URL from signature URL

  if (queryString) {
    const params = new URLSearchParams(queryString);
    const sortedKeys = Array.from(params.keys()).sort();
    const sortedParams = new URLSearchParams();
    sortedKeys.forEach(key => {
      params.getAll(key).forEach(val => sortedParams.append(key, val));
    });
    
    // Tuya signature requires decoded parameters
    sortedPath = `${basePath}?${decodeURIComponent(sortedParams.toString())}`;
    
    // HTTP Fetch requires standard encoded parameters
    fetchUrl = `https://${domain}${basePath}?${sortedParams.toString()}`;
  }

  const clientId = creds?.clientId || env.TUYA_CLIENT_ID;
  const clientSecret = creds?.clientSecret || env.TUYA_CLIENT_SECRET;
  const accessToken = await getAccessToken(env, creds);
  const t = Date.now().toString();

  let contentSha = EMPTY_BODY_SHA;
  let bodyStr = '';
  if (body) {
    bodyStr = typeof body === 'string' ? body : JSON.stringify(body);
    contentSha = await sha256(bodyStr);
  }

  const stringToSign = `${method}\n${contentSha}\n\n${sortedPath}`;
  const str = `${clientId}${accessToken}${t}${stringToSign}`;
  const sign = (await hmacSha256(clientSecret, str)).toUpperCase();

  const headers = {
    'client_id': clientId,
    'access_token': accessToken,
    'sign': sign,
    't': t,
    'sign_method': 'HMAC-SHA256'
  };

  if (body) {
    headers['Content-Type'] = 'application/json';
  }

  const response = await fetch(fetchUrl, {
    method,
    headers,
    body: body ? bodyStr : undefined
  });

  if (!response.ok) {
    throw new Error(`Tuya Request failed with HTTP ${response.status}`);
  }

  return await response.json();
}

function corsHeaders() {
  return {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': '*',
    'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
    'Content-Type': 'application/json'
  };
}

// Data Scaling Helpers
const scaleTemp = (val) => {
  const num = Number(val);
  if (isNaN(num)) return 0;
  return num > 100 ? num / 10 : num;
};

const scaleHumidity = (val) => {
  const num = Number(val);
  if (isNaN(num)) return 0;
  return num > 100 ? num / 10 : num;
};

const scalePower = (val) => {
  const num = Number(val);
  if (isNaN(num)) return 0;
  return num / 10;
};

const scaleVoltage = (val) => {
  const num = Number(val);
  if (isNaN(num)) return 0;
  return num > 1000 ? num / 10 : num;
};

const scaleCurrent = (val) => {
  const num = Number(val);
  if (isNaN(num)) return 0;
  return num / 1000;
};

// FIX #5: Improved timezone math (calculates offset at noon to avoid DST edge cases at midnight)
function getLocalMidnightTime(timezone = 'Europe/Belgrade') {
  const now = new Date();
  try {
    const formatter = new Intl.DateTimeFormat('en-US', {
      timeZone: timezone,
      year: 'numeric', month: 'numeric', day: 'numeric'
    });
    const parts = formatter.formatToParts(now);
    
    const y = parseInt(parts.find(p => p.type === 'year').value, 10);
    const m = parseInt(parts.find(p => p.type === 'month').value, 10) - 1;
    const d = parseInt(parts.find(p => p.type === 'day').value, 10);
    
    // Create UTC date at noon to securely fetch offset without DST boundary issues
    const noonUtc = new Date(Date.UTC(y, m, d, 12, 0, 0));
    
    const tzDate = new Date(noonUtc.toLocaleString('en-US', { timeZone: timezone }));
    const utcDate = new Date(noonUtc.toLocaleString('en-US', { timeZone: 'UTC' }));
    const offsetMs = tzDate.getTime() - utcDate.getTime();
    
    return Date.UTC(y, m, d, 0, 0, 0) - offsetMs;
  } catch (err) {
    const d = new Date();
    return new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
  }
}

function getTzStartMs(d, timezone = 'Europe/Belgrade') {
  try {
    const parts = new Intl.DateTimeFormat('en-US', {
      timeZone: timezone,
      year: 'numeric', month: 'numeric', day: 'numeric',
      hour: 'numeric', hour12: false
    }).formatToParts(d);

    const year = parseInt(parts.find(p => p.type === 'year').value, 10);
    const month = parseInt(parts.find(p => p.type === 'month').value, 10) - 1;
    const day = parseInt(parts.find(p => p.type === 'day').value, 10);
    let hour = parseInt(parts.find(p => p.type === 'hour').value, 10);
    if (hour === 24) hour = 0;

    const targetUtc = new Date(Date.UTC(year, month, day, hour, 30, 0)); 
    const tzDate = new Date(targetUtc.toLocaleString('en-US', { timeZone: timezone }));
    const utcDate = new Date(targetUtc.toLocaleString('en-US', { timeZone: 'UTC' }));
    const offsetMs = tzDate.getTime() - utcDate.getTime();

    return Date.UTC(year, month, day, hour, 0, 0) - offsetMs;
  } catch (err) {
    return Math.floor(d.getTime() / (60 * 60 * 1000)) * (60 * 60 * 1000);
  }
}

// FIX #3: Scale single add_ele register value to kWh without multiplying by 10
const scaleEnergyKwh = (val) => {
  const num = Number(val);
  if (isNaN(num) || num <= 0) return 0;
  return Number((num / 1000).toFixed(2));
};

// Helper to paginate up to 10 pages of Tuya report logs
async function fetchAllReportLogs(env, deviceId, codes, startTime, endTime, creds) {
  let allLogs = [];
  let lastRowKey = '';
  let hasMore = true;
  let pageCount = 0;

  while (hasMore && pageCount < 10) {
    // FIX #2: Restored to size=100 and removed conflicting start_row_key
    const rowKeyParam = lastRowKey ? `&last_row_key=${encodeURIComponent(lastRowKey)}` : '';
    const res = await makeTuyaRequest(
      env,
      `/v2.0/cloud/thing/${deviceId}/report-logs?codes=${codes}&start_time=${startTime}&end_time=${endTime}&size=100${rowKeyParam}`,
      'GET',
      null,
      creds
    );
    const pageLogs = res?.result?.logs || [];
    allLogs = allLogs.concat(pageLogs);
    hasMore = res?.result?.has_more || false;
    lastRowKey = res?.result?.next_row_key || res?.result?.last_row_key || '';
    pageCount++;
    if (pageLogs.length === 0 || !lastRowKey) break;
  }

  return allLogs;
}

// Process 24-Hour Temperature Logs into Normalized Buckets
function processTempHistory(logs, fallbackTemp = 0, fallbackHum = 0, tCode = 'va_temperature', hCode = 'va_humidity', timezone = 'Europe/Belgrade') {
  const now = new Date();
  const buckets = [];
  
  const hourFormatter = new Intl.DateTimeFormat('en-GB', {
    timeZone: timezone,
    hour: '2-digit',
    minute: '2-digit',
    hour12: false
  });

  for (let i = 23; i >= 0; i--) {
    const d = new Date(now.getTime() - i * 60 * 60 * 1000);
    const startMs = getTzStartMs(d, timezone);
    const endMs = startMs + 60 * 60 * 1000;
    const hourStr = hourFormatter.format(new Date(startMs));
    buckets.push({ hourStr, startMs, endMs, temps: [], hums: [] });
  }

  logs.forEach(log => {
    const eventMs = Number(log.event_time);
    const bucket = buckets.find(b => eventMs >= b.startMs && eventMs < b.endMs);
    if (bucket) {
      if (log.code === tCode || log.code === 'temp_current' || log.code === 'va_temperature') {
        bucket.temps.push(scaleTemp(log.value));
      } else if (log.code === hCode || log.code === 'humidity_value' || log.code === 'va_humidity') {
        bucket.hums.push(scaleHumidity(log.value));
      }
    }
  });

  let currentTemp = null;
  let currentHum = null;

  const mapped = buckets.map(b => {
    const avgTemp = b.temps.length > 0 
      ? Number((b.temps.reduce((a, v) => a + v, 0) / b.temps.length).toFixed(1))
      : null;
    const avgHum = b.hums.length > 0 
      ? Math.round(b.hums.reduce((a, v) => a + v, 0) / b.hums.length)
      : null;

    if (avgTemp !== null) currentTemp = avgTemp;
    if (avgHum !== null) currentHum = avgHum;

    return { time: b.hourStr, temp: currentTemp, humidity: currentHum };
  });

  const firstValidTemp = mapped.find(m => m.temp !== null)?.temp ?? fallbackTemp;
  const firstValidHum = mapped.find(m => m.humidity !== null)?.humidity ?? fallbackHum;

  return mapped.map(m => ({
    time: m.time,
    temp: m.temp !== null ? m.temp : firstValidTemp,
    humidity: m.humidity !== null ? m.humidity : firstValidHum
  }));
}

// Process 24-Hour Power Logs into Normalized Buckets
// Prefers cur_power averages when present; fills silent hours from add_ele energy
// increments (Wh per hour ≈ average watts). Never carries forward stale loads:
// an hour with no reports while the consumer is off must read 0W, not the last load.
function processPowerHistory(logs, fallbackLoad = 0, pCode = 'cur_power', timezone = 'Europe/Belgrade', energyLogs = []) {
  const now = new Date();
  const buckets = [];
  
  const hourFormatter = new Intl.DateTimeFormat('en-GB', {
    timeZone: timezone,
    hour: '2-digit',
    minute: '2-digit',
    hour12: false
  });

  for (let i = 23; i >= 0; i--) {
    const d = new Date(now.getTime() - i * 60 * 60 * 1000);
    const startMs = getTzStartMs(d, timezone);
    const endMs = startMs + 60 * 60 * 1000;
    const hourStr = hourFormatter.format(new Date(startMs));
    buckets.push({ hourStr, startMs, endMs, loads: [], energyWh: [] });
  }

  logs.forEach(log => {
    if (log.code === pCode || log.code === 'power' || log.code === 'cur_power') {
      const eventMs = Number(log.event_time);
      const bucket = buckets.find(b => eventMs >= b.startMs && eventMs < b.endMs);
      if (bucket) {
        bucket.loads.push(Math.round(scalePower(log.value)));
      }
    }
  });

  // Bucket add_ele energy increments (values in Wh) to fill hours with no cur_power reports
  energyLogs.forEach(log => {
    const eventMs = Number(log.event_time);
    const bucket = buckets.find(b => eventMs >= b.startMs && eventMs < b.endMs);
    if (bucket) {
      const v = Number(log.value);
      if (!isNaN(v) && v > 0) bucket.energyWh.push(v);
    }
  });

  return buckets.map(b => {
    let loadWatts = 0;
    if (b.loads.length > 0) {
      loadWatts = Math.round(b.loads.reduce((a, v) => a + v, 0) / b.loads.length);
    } else if (b.energyWh.length > 0) {
      // Wh consumed in this hour ≈ average watts for the hour
      loadWatts = Math.round(b.energyWh.reduce((a, v) => a + v, 0));
    }
    return {
      time: b.hourStr,
      loadWatts,
      voltage: loadWatts > 0 ? 230 : 0,
      currentAmps: loadWatts > 0 ? Number((loadWatts / 230).toFixed(2)) : 0
    };
  });
}

// Helper to resolve configuration from URL params, Cloudflare KV namespace, or env vars
// ---- History cache (Tuya rate-limit guard) ----
// Tuya cloud throttles report-logs hard; live device status (1 call/device)
// is cheap and the local TV Box daemon is free. The 24h histories (temp
// history, hourly power, today's kWh) are therefore re-queried at most once
// per HISTORY_CACHE_TTL_MS and served from cache in between — otherwise the
// app's 10s polling burns the rate limit and values collapse to 0. When a
// refresh comes back empty (rate-limited), the last good values are kept.
const HISTORY_CACHE_TTL_MS = 5 * 60 * 1000;
let historyCache = null; // { key, ts, sensor1, sensor2, power }

async function getConfig(env, url) {
  let kvConfig = null;
  const uid = url.searchParams.get('uid') || 'default';
  if (env.SMART_HOME_CONFIG) {
    try {
      if (uid && uid !== 'default') {
        kvConfig = await env.SMART_HOME_CONFIG.get(`user_config_${uid}`, 'json');
      }
      if (!kvConfig) {
        kvConfig = await env.SMART_HOME_CONFIG.get('user_config', 'json');
      }
    } catch (e) {}
  }

  return {
    clientId: url.searchParams.get('clientId') || kvConfig?.clientId || env.TUYA_CLIENT_ID,
    clientSecret: url.searchParams.get('clientSecret') || kvConfig?.clientSecret || env.TUYA_CLIENT_SECRET,
    region: url.searchParams.get('region') || kvConfig?.region || env.TUYA_REGION || 'eu',
    tempDeviceId1: url.searchParams.get('tempDeviceId1') || kvConfig?.tempDeviceId1 || env.TEMP_DEVICE_ID_1,
    tempDeviceId2: url.searchParams.get('tempDeviceId2') || kvConfig?.tempDeviceId2 || env.TEMP_DEVICE_ID_2,
    powerDeviceId: url.searchParams.get('powerDeviceId') || kvConfig?.powerDeviceId || env.POWER_DEVICE_ID,
    tempCode1: url.searchParams.get('tempCode1') || kvConfig?.tempCode1 || env.TEMP_CODE_1 || 'va_temperature',
    humCode1: url.searchParams.get('humCode1') || kvConfig?.humCode1 || env.HUM_CODE_1 || 'va_humidity',
    tempCode2: url.searchParams.get('tempCode2') || kvConfig?.tempCode2 || env.TEMP_CODE_2 || 'va_temperature',
    humCode2: url.searchParams.get('humCode2') || kvConfig?.humCode2 || env.HUM_CODE_2 || 'va_humidity',
    powerCode: url.searchParams.get('powerCode') || kvConfig?.powerCode || env.POWER_CODE || 'cur_power',
    voltCode: url.searchParams.get('voltageCode') || kvConfig?.voltageCode || env.VOLTAGE_CODE || 'cur_voltage',
    currCode: url.searchParams.get('currentCode') || kvConfig?.currentCode || env.CURRENT_CODE || 'cur_current',
    energyCode: url.searchParams.get('energyCode') || kvConfig?.energyCode || env.ENERGY_CODE || 'add_ele',
    tempName1: url.searchParams.get('tempName1') || kvConfig?.tempName1 || env.TEMP_NAME_1 || 'Living Room Sensor',
    tempLoc1: url.searchParams.get('tempLoc1') || kvConfig?.tempLoc1 || env.TEMP_LOC_1 || 'Main Floor',
    tempName2: url.searchParams.get('tempName2') || kvConfig?.tempName2 || env.TEMP_NAME_2 || 'Greenhouse Sensor',
    tempLoc2: url.searchParams.get('tempLoc2') || kvConfig?.tempLoc2 || env.TEMP_LOC_2 || 'Backyard Garden',
    powerName: url.searchParams.get('powerName') || kvConfig?.powerName || env.POWER_NAME || 'Main Grid Meter',
    tvBoxUrl: url.searchParams.get('tvBoxUrl') || kvConfig?.localTvBoxIp || 'http://filip013.duckdns.org/live',
    timezone: url.searchParams.get('timezone') || kvConfig?.timezone || env.TIMEZONE || 'Europe/Belgrade'
  };
}

export default {
  async fetch(request, env, ctx) {
    if (request.method === 'OPTIONS') {
      return new Response(null, { headers: corsHeaders() });
    }

    const url = new URL(request.url);

    if (env.AUTH_SECRET) {
      const authHeader = request.headers.get('Authorization');
      if (authHeader !== `Bearer ${env.AUTH_SECRET}`) {
        return new Response(JSON.stringify({ error: 'Unauthorized' }), {
          status: 401,
          headers: corsHeaders()
        });
      }
    }

    try {
      if (url.pathname === '/api/config' && request.method === 'POST') {
        if (!env.SMART_HOME_CONFIG) {
          return new Response(JSON.stringify({ success: false, error: 'KV Namespace is not bound.' }), {
            status: 400,
            headers: corsHeaders()
          });
        }
        const body = await request.json();
        const uid = body.uid || url.searchParams.get('uid');
        const keyName = (uid && uid !== 'default') ? `user_config_${uid}` : 'user_config';
        await env.SMART_HOME_CONFIG.put(keyName, JSON.stringify(body));
        return new Response(JSON.stringify({ success: true, message: 'Saved' }), { headers: corsHeaders() });
      }

      if (url.pathname === '/api/status' && request.method === 'GET') {
        const config = await getConfig(env, url);
        const creds = { clientId: config.clientId, clientSecret: config.clientSecret, region: config.region };

        const endTime = Date.now();
        const startTime = endTime - 24 * 60 * 60 * 1000;

        // Rate-limit guard: reuse cached 24h histories when fresh.
        const historyKey = [
          config.tempDeviceId1, config.tempDeviceId2, config.powerDeviceId,
          config.tempCode1, config.tempCode2, config.powerCode, config.energyCode,
          config.timezone
        ].join('|');
        const cacheFresh = historyCache && historyCache.key === historyKey &&
          (Date.now() - historyCache.ts) < HISTORY_CACHE_TTL_MS;

        let sensor1Err = null;
        let sensor2Err = null;
        let powerErr = null;

        // FIX #4: Fetch all devices simultaneously instead of waiting sequentially to avoid Cloudflare timeouts
        const [sensor1, sensor2, powerMeter, tvBoxData] = await Promise.all([
          // 1. Fetch Sensor 1
          (async () => {
            if (!config.tempDeviceId1) return null;
            try {
              const statusRes = await makeTuyaRequest(env, `/v1.0/devices/${config.tempDeviceId1}/status`, 'GET', null, creds);
              const status = statusRes.result || [];
              
              const tempVal = status.find(s => s.code === config.tempCode1 || s.code === 'temp_current')?.value;
              const humVal = status.find(s => s.code === config.humCode1 || s.code === 'humidity_value')?.value;
              const batVal = status.find(s => s.code === 'battery_percentage' || s.code === 'battery')?.value;

              const currentTemp = tempVal !== undefined ? scaleTemp(tempVal) : 0;
              const currentHumidity = humVal !== undefined ? scaleHumidity(humVal) : 0;
              const battery = batVal !== undefined ? Number(batVal) : 0;

              let history;
              if (cacheFresh && historyCache.sensor1) {
                history = historyCache.sensor1;
              } else {
                const logs = await fetchAllReportLogs(env, config.tempDeviceId1, `${config.tempCode1},${config.humCode1}`, startTime, endTime, creds);
                history = processTempHistory(logs, currentTemp, currentHumidity, config.tempCode1, config.humCode1, config.timezone);
              }

              return {
                id: config.tempDeviceId1,
                name: config.tempName1 || 'Living Room Sensor',
                location: config.tempLoc1 || 'Main Floor',
                currentTemp,
                currentHumidity,
                status: 'online',
                battery,
                history
              };
            } catch (err) {
              sensor1Err = err.message || String(err);
              console.error('Error fetching sensor 1:', err);
              return null;
            }
          })(),

          // 2. Fetch Sensor 2
          (async () => {
            if (!config.tempDeviceId2) return null;
            try {
              const statusRes = await makeTuyaRequest(env, `/v1.0/devices/${config.tempDeviceId2}/status`, 'GET', null, creds);
              const status = statusRes.result || [];
              
              const tempVal = status.find(s => s.code === config.tempCode2 || s.code === 'temp_current')?.value;
              const humVal = status.find(s => s.code === config.humCode2 || s.code === 'humidity_value')?.value;
              const batVal = status.find(s => s.code === 'battery_percentage' || s.code === 'battery')?.value;

              const currentTemp = tempVal !== undefined ? scaleTemp(tempVal) : 0;
              const currentHumidity = humVal !== undefined ? scaleHumidity(humVal) : 0;
              const battery = batVal !== undefined ? Number(batVal) : 0;

              let history;
              if (cacheFresh && historyCache.sensor2) {
                history = historyCache.sensor2;
              } else {
                const logs = await fetchAllReportLogs(env, config.tempDeviceId2, `${config.tempCode2},${config.humCode2}`, startTime, endTime, creds);
                history = processTempHistory(logs, currentTemp, currentHumidity, config.tempCode2, config.humCode2, config.timezone);
              }

              return {
                id: config.tempDeviceId2,
                name: config.tempName2 || 'Greenhouse Sensor',
                location: config.tempLoc2 || 'Backyard Garden',
                currentTemp,
                currentHumidity,
                status: 'online',
                battery,
                history
              };
            } catch (err) {
              sensor2Err = err.message || String(err);
              console.error('Error fetching sensor 2:', err);
              return null;
            }
          })(),

          // 3. Fetch Power Meter
          (async () => {
            if (!config.powerDeviceId) return null;
            try {
              const statusRes = await makeTuyaRequest(env, `/v1.0/devices/${config.powerDeviceId}/status`, 'GET', null, creds);
              const status = statusRes.result || [];

              const pVal = status.find(s => s.code === config.powerCode || s.code === 'cur_power')?.value;
              const vVal = status.find(s => s.code === config.voltCode || s.code === 'cur_voltage')?.value;
              const iVal = status.find(s => s.code === config.currCode || s.code === 'cur_current')?.value;
              const eVal = status.find(s => s.code === config.energyCode || s.code === 'add_ele')?.value;

              const currentLoad = pVal !== undefined ? Number(scalePower(pVal).toFixed(1)) : 0;
              const voltage = vVal !== undefined ? Number(scaleVoltage(vVal).toFixed(1)) : 0;
              const currentAmps = iVal !== undefined ? Number(scaleCurrent(iVal).toFixed(2)) : (currentLoad > 0 ? Number((currentLoad / 230).toFixed(2)) : 0);

              let hourlyHistory;
              let todayKwh = 0;
              let energyDebug = { path: 'none', energyLogsCount: 0, sumRaw: 0, midnight: 0, eVal: eVal };

              if (cacheFresh && historyCache.power) {
                hourlyHistory = historyCache.power.hourlyHistory;
                todayKwh = historyCache.power.todayKwh;
                energyDebug = historyCache.power.energyDebug;
              } else {
                const logs = await fetchAllReportLogs(env, config.powerDeviceId, config.powerCode, startTime, endTime, creds);
                // Fetch add_ele over the full 24h window too, so hours without cur_power
                // reports (e.g. consumer off / steady draw) can be filled from energy deltas.
                let energyLogs24h = [];
                try {
                  energyLogs24h = await fetchAllReportLogs(env, config.powerDeviceId, config.energyCode, startTime, endTime, creds);
                } catch (energyErr) {
                  console.error('Error fetching 24h energy logs:', energyErr);
                }
                hourlyHistory = processPowerHistory(logs, currentLoad, config.powerCode, config.timezone, energyLogs24h);

                try {
                  const midnight = getLocalMidnightTime(config.timezone);
                  energyDebug.midnight = midnight;

                  const energyLogs = await fetchAllReportLogs(env, config.powerDeviceId, config.energyCode, midnight, endTime, creds);
                  energyDebug.energyLogsCount = energyLogs.length;

                  if (energyLogs.length > 0) {
                    const sumRaw = energyLogs.reduce((acc, l) => acc + (Number(l.value) || 0), 0);
                    energyDebug.sumRaw = sumRaw;
                    todayKwh = Number((sumRaw / 1000).toFixed(2));
                    energyDebug.path = 'logs_sum_div_1000';
                  }
                } catch (eErr) {
                  energyDebug.path = 'error: ' + (eErr.message || String(eErr));
                }

                if (todayKwh === 0 && eVal !== undefined) {
                  todayKwh = scaleEnergyKwh(eVal);
                  energyDebug.path = 'fallback_scaleEnergyKwh';
                }
              }

              return {
                id: config.powerDeviceId,
                name: config.powerName || 'Main Grid Meter',
                currentLoad,
                voltage,
                currentAmps,
                todayKwh,
                energyDebug,
                hourlyHistory,
                dailyHistory: []
              };
            } catch (err) {
              powerErr = err.message || String(err);
              console.error('Error fetching power meter:', err);
              return null;
            }
          })(),

          // 4. Fetch TV Box Daemon
          (async () => {
            const tvBoxUrl = env.TV_BOX_POWER_URL || config.tvBoxUrl || url.searchParams.get('localTvBoxIp');
            if (!tvBoxUrl) return null;
            
            try {
              const tvBoxHeaders = { 'Accept': 'application/json', 'User-Agent': 'SmartHomeWorker/1.0' };
              const secretToken = env.TUYA_CLIENT_SECRET || env.AUTH_SECRET || url.searchParams.get('clientSecret');
              const reqAuth = request.headers.get('Authorization');

              if (secretToken) tvBoxHeaders['Authorization'] = secretToken.startsWith('Bearer ') ? secretToken : `Bearer ${secretToken}`;
              else if (reqAuth) tvBoxHeaders['Authorization'] = reqAuth;

              const tvBoxRes = await fetch(tvBoxUrl, { method: 'GET', headers: tvBoxHeaders });
              if (tvBoxRes.ok) {
                const text = await tvBoxRes.text();
                try { return JSON.parse(text); } catch { return { raw: text }; }
              }
              return { error: `HTTP ${tvBoxRes.status} ${tvBoxRes.statusText}` };
            } catch (tvErr) {
              return { error: `TV Box unreachable: ${tvErr.message}` };
            }
          })()
        ]);

        // Store fresh histories for the next polls. Keep the previous good
        // values when a refresh returns nothing (rate-limited) so the API
        // never collapses to zeros.
        if (!cacheFresh) {
          const prev = historyCache;
          historyCache = {
            key: historyKey,
            ts: Date.now(),
            sensor1: sensor1 && sensor1.history && sensor1.history.length > 0
              ? sensor1.history
              : (prev ? prev.sensor1 : null),
            sensor2: sensor2 && sensor2.history && sensor2.history.length > 0
              ? sensor2.history
              : (prev ? prev.sensor2 : null),
            power: powerMeter && powerMeter.hourlyHistory && powerMeter.hourlyHistory.length > 0
              ? { hourlyHistory: powerMeter.hourlyHistory, todayKwh: powerMeter.todayKwh, energyDebug: powerMeter.energyDebug }
              : (prev ? prev.power : null)
          };
        }

        const sensors = [sensor1, sensor2].filter(Boolean);

        return new Response(JSON.stringify({
          success: true,
          timestamp: Math.floor(Date.now() / 1000),
          sensors,
          power: powerMeter,
          tvBox: tvBoxData,
          debug: {
            workerVersion: '2026-08-03-v3-fixed',
            hasKv: Boolean(env.SMART_HOME_CONFIG),
            uid: url.searchParams.get('uid'),
            config,
            sensor1Err,
            sensor2Err,
            powerErr
          }
        }), { headers: corsHeaders() });
      }

      // ROUTE 2: GET /api/wear-summary
      if (url.pathname === '/api/wear-summary' && request.method === 'GET') {
        const config = await getConfig(env, url);
        const creds = { clientId: config.clientId, clientSecret: config.clientSecret, region: config.region };
        
        let primaryTemp = null, primaryHum = null;
        let secondaryTemp = null, secondaryHum = null;
        let activePowerWatts = 0;

        const tasks = [];
        
        // Fetch Belgrade (Sensor 1)
        if (config.tempDeviceId1) {
          tasks.push(makeTuyaRequest(env, `/v1.0/devices/${config.tempDeviceId1}/status`, 'GET', null, creds)
            .then(res => {
              const status = res.result || [];
              const tempVal = status.find(s => s.code === config.tempCode1 || s.code === 'temp_current')?.value;
              const humVal = status.find(s => s.code === config.humCode1 || s.code === 'humidity_value')?.value;
              if (tempVal !== undefined) primaryTemp = scaleTemp(tempVal);
              if (humVal !== undefined) primaryHum = scaleHumidity(humVal);
            }).catch(() => {}));
        }

        // Fetch Vršac (Sensor 2)
        if (config.tempDeviceId2) {
          tasks.push(makeTuyaRequest(env, `/v1.0/devices/${config.tempDeviceId2}/status`, 'GET', null, creds)
            .then(res => {
              const status = res.result || [];
              const tempVal = status.find(s => s.code === config.tempCode2 || s.code === 'temp_current')?.value;
              const humVal = status.find(s => s.code === config.humCode2 || s.code === 'humidity_value')?.value;
              if (tempVal !== undefined) secondaryTemp = scaleTemp(tempVal);
              if (humVal !== undefined) secondaryHum = scaleHumidity(humVal);
            }).catch(() => {}));
        }

        // Fetch Power
        if (config.powerDeviceId) {
          tasks.push(makeTuyaRequest(env, `/v1.0/devices/${config.powerDeviceId}/status`, 'GET', null, creds)
            .then(res => {
              const status = res.result || [];
              const pVal = status.find(s => s.code === config.powerCode || s.code === 'cur_power')?.value;
              if (pVal !== undefined) activePowerWatts = scalePower(pVal);
            }).catch(() => {}));
        }

        await Promise.all(tasks);

        return new Response(JSON.stringify({
          success: true,
          timestamp: Math.floor(Date.now() / 1000),
          belgrade: { temp: primaryTemp, humidity: primaryHum },
          vrsac: { temp: secondaryTemp, humidity: secondaryHum },
          powerWatts: activePowerWatts
        }), { headers: corsHeaders() });
      }

      // ROUTE 3: POST /api/control
      if (url.pathname === '/api/control' && request.method === 'POST') {
        const config = await getConfig(env, url);
        const creds = { clientId: config.clientId, clientSecret: config.clientSecret, region: config.region };

        const body = await request.json();
        const { deviceId, commands } = body;
        if (!deviceId || !commands) return new Response(JSON.stringify({ error: 'Missing payload' }), { status: 400, headers: corsHeaders() });

        const tuyaResponse = await makeTuyaRequest(env, `/v1.0/devices/${deviceId}/commands`, 'POST', { commands }, creds);
        return new Response(JSON.stringify(tuyaResponse), { headers: corsHeaders() });
      }

      // ROUTE 4: ALL /proxy
      if (url.pathname === '/proxy' || url.searchParams.has('url')) {
        const config = await getConfig(env, url);
        const creds = { clientId: config.clientId, clientSecret: config.clientSecret, region: config.region };
        const targetUrl = url.searchParams.get('url');

        if (!targetUrl) return new Response('Missing ?url= parameter', { status: 400, headers: corsHeaders() });

        try {
          const parsed = new URL(targetUrl);
          const tuyaPath = parsed.pathname + parsed.search;
          const tuyaResponse = await makeTuyaRequest(env, tuyaPath, request.method, null, creds);
          return new Response(JSON.stringify(tuyaResponse), { headers: corsHeaders() });
        } catch (pErr) {
          const response = await fetch(targetUrl, {
            method: request.method,
            headers: request.headers,
            body: request.method !== 'GET' && request.method !== 'HEAD' ? await request.arrayBuffer() : null
          });
          return new Response(response.body, { status: response.status, headers: corsHeaders() });
        }
      }

      return new Response(JSON.stringify({
        message: 'Smart Home Cloudflare Worker API is running.',
        endpoints: ['GET /api/status', 'GET /api/wear-summary', 'POST /api/control', 'GET /proxy?url=...']
      }), { headers: corsHeaders() });

    } catch (err) {
      return new Response(JSON.stringify({ success: false, error: err.message }), {
        status: 500,
        headers: corsHeaders()
      });
    }
  }
};