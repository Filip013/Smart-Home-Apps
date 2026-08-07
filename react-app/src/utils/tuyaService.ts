import { initializeApp, getApps, getApp } from 'firebase/app';
import { getFirestore, doc, getDoc, setDoc, collection, getDocs } from 'firebase/firestore';
import { 
  initializeAuth,
  browserLocalPersistence,
  browserPopupRedirectResolver,
  getAuth,
  GoogleAuthProvider, 
  signInWithPopup, 
  signInWithCredential,
  signOut as fbSignOut,
  onAuthStateChanged,
  getRedirectResult
} from 'firebase/auth';
import type { User } from 'firebase/auth';
import { isTauri, invoke } from '@tauri-apps/api/core';
import { sha256, hmacSha256 } from './cryptoUtils';

export interface TuyaConfig {
  clientId: string;
  clientSecret: string;
  region: 'us' | 'eu' | 'eu-west' | 'cn' | 'in';
  tempDeviceId1: string;
  tempDeviceId2: string;
  powerDeviceId: string;
  customProxyUrl?: string; // Custom private CORS proxy (e.g. Cloudflare Worker)
  // Dynamic DP codes mapping
  tempCode1?: string;
  humCode1?: string;
  tempCode2?: string;
  humCode2?: string;
  powerCode?: string;
  voltageCode?: string;
  currentCode?: string;
  energyCode?: string;
  // Custom Device Names & Locations
  tempName1?: string;
  tempLoc1?: string;
  tempName2?: string;
  tempLoc2?: string;
  powerName?: string;
  powerLoc?: string;
  localTvBoxIp?: string; // Local IP address and port of the Termux daemon (e.g., http://192.168.1.15:8080)
  bypassProxyForLocal?: boolean; // Bypass the Cloudflare Worker CORS proxy and fetch directly
}

// Simulation flag: set to true to force local dev server to use the production CORS proxy path
const FORCE_PRODUCTION_PROXY = false;

// Helper to construct fetch URL depending on environment (localhost proxy vs production CORS bypass with URL encoding and cache-busting)
const constructFetchUrl = (
  region: 'us' | 'eu' | 'eu-west' | 'cn' | 'in',
  path: string,
  headers?: Record<string, string>
): string => {
  const domainMap: Record<string, string> = {
    'us': 'openapi.tuyaus.com',
    'eu': 'openapi.tuyaeu.com',
    'eu-west': 'openapi-weaz.tuyaeu.com',
    'cn': 'openapi.tuyacn.com',
    'in': 'openapi.tuyain.com'
  };
  const targetDomain = domainMap[region] || 'openapi.tuyaeu.com';
  const targetUrl = `https://${targetDomain}${path}`;
  
  // Check if user has set a custom CORS proxy URL (e.g. their own Cloudflare Worker)
  const localData = localStorage.getItem('tuya_config');
  const config = localData ? JSON.parse(localData) as TuyaConfig : null;
  const customProxyUrl = config?.customProxyUrl?.trim();

  if (customProxyUrl) {
    // With a custom Cloudflare Worker proxy, we don't need reqHeaders/resHeaders hacks
    // because the Worker is programmed to forward all incoming headers directly!
    return `${customProxyUrl}?url=${encodeURIComponent(targetUrl)}&_cb=${Date.now()}`;
  }

  if (!FORCE_PRODUCTION_PROXY && (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1')) {
    return `/tuya-${region}${path}`;
  }
  
  // Custom CORS preflight request headers allowed by corsproxy.io
  const allowedHeaders = 'client_id,access_token,sign,t,sign_method,content-type';
  let proxyUrl = `https://corsproxy.io/?url=${encodeURIComponent(targetUrl)}&resHeaders=access-control-allow-headers:${encodeURIComponent(allowedHeaders)}`;
  
  // Forward custom request headers to Tuya by passing them via repeated reqHeaders query parameters
  if (headers) {
    Object.entries(headers).forEach(([key, val]) => {
      proxyUrl += `&reqHeaders=${key}:${encodeURIComponent(val)}`;
    });
  }
  
  proxyUrl += `&_cb=${Date.now()}`;
  return proxyUrl;
};

// Hardcoded Firebase configuration provided by the user
const firebaseConfig = {
  apiKey: "AIzaSyC4FcjFosdCMxWnPAeMe_ObZPDShnHZy2E",
  authDomain: "gen-lang-client-0142372615.firebaseapp.com",
  projectId: "gen-lang-client-0142372615",
  storageBucket: "gen-lang-client-0142372615.firebasestorage.app",
  messagingSenderId: "115950049911",
  appId: "1:115950049911:web:24f61e62fe5602dcc78472",
  measurementId: "G-GWRHMX8RE5"
};

// Initialize Firebase — use modular auth with explicit persistence
// to avoid cross-origin iframe bug in WebKitGTK (Linux) / Android WebView.
// See Language-Learning-React-Apps/src/firebase.js for the proven pattern.
const app = getApps().length === 0 ? initializeApp(firebaseConfig) : getApp();
export const db = getFirestore(app);
let _auth: import('firebase/auth').Auth;
try {
  _auth = initializeAuth(app, { persistence: browserLocalPersistence });
} catch {
  // already initialized (HMR) — fall back
  _auth = getAuth(app);
}
export const auth = _auth;
export const googleProvider = new GoogleAuthProvider();

// Google Auth Handlers
export const signInWithGoogle = async (): Promise<User | null> => {
  googleProvider.setCustomParameters({ prompt: 'select_account' });
  
  if (isTauri()) {
    try {
      const { openUrl } = await import('@tauri-apps/plugin-opener');
      // In development, use local dev server. In production, use window.location.origin or Vercel URL
      const baseUrl = import.meta.env.DEV 
        ? "http://localhost:5173" 
        : (window.location.origin.startsWith('http') && !window.location.origin.includes('tauri')
            ? window.location.origin
            : "https://aether-smart.vercel.app");
      const authProxyUrl = `${baseUrl}/#/desktop-auth?source=tauri`;

      // 1. Start the local server in Rust to listen for token
      const tokenPromise = invoke<string>('start_auth_server');

      // 2. Open default browser (fall back to window.open if plugin-opener fails)
      openUrl(authProxyUrl).catch((err: any) => {
        console.warn("openUrl failed, falling back to window.open:", err);
        window.open(authProxyUrl, '_blank');
      });

      // 3. Wait for token from local auth server
      const token = await tokenPromise;

      if (token) {
        const credential = GoogleAuthProvider.credential(token.trim());
        const result = await signInWithCredential(auth, credential);
        return result.user;
      } else {
        throw new Error("No token returned from authentication server.");
      }
    } catch (err) {
      console.error("Desktop Auth Error:", err);
      throw err;
    }
  } else {
    const result = await signInWithPopup(auth, googleProvider, browserPopupRedirectResolver);
    return result.user;
  }
};

export const signOut = async (): Promise<void> => {
  await fbSignOut(auth);
  // Clear cached tokens on logout
  clearTokenCache();
};

export { onAuthStateChanged, getRedirectResult };

// Save Tuya Config tied to User UID
export const saveTuyaConfig = async (config: TuyaConfig): Promise<void> => {
  localStorage.setItem('tuya_config', JSON.stringify(config));
  
  const user = auth.currentUser;
  if (user) {
    try {
      // 1. Make the parent User document "real" so the Python script can see it
      const userRef = doc(db, 'artifacts', 'smart-home-apps', 'users', user.uid);
      await setDoc(userRef, { initialized: true, uid: user.uid }, { merge: true });

      // 2. Save the Tuya settings in the subcollection
      const docRef = doc(db, 'artifacts', 'smart-home-apps', 'users', user.uid, 'settings', 'tuya');
      await setDoc(docRef, config);
    } catch (e) {
      console.error("Failed to save config to Firestore:", e);
    }
  }
};

// Get Tuya Config tied to User UID
export const getTuyaConfig = async (): Promise<TuyaConfig | null> => {
  const user = auth.currentUser;
  if (user) {
    try {
      const docRef = doc(db, 'artifacts', 'smart-home-apps', 'users', user.uid, 'settings', 'tuya');
      const snap = await getDoc(docRef);
      if (snap.exists()) {
        const firestoreConfig = snap.data() as TuyaConfig;
        localStorage.setItem('tuya_config', JSON.stringify(firestoreConfig));
        return firestoreConfig;
      }
    } catch (e) {
      console.error("Failed to fetch config from Firestore:", e);
    }
  }

  // Fallback to LocalStorage
  const localData = localStorage.getItem('tuya_config');
  return localData ? JSON.parse(localData) : null;
};

// Synchronous cached config reader to avoid making network requests in high-frequency loops
export const getCachedTuyaConfig = (): TuyaConfig | null => {
  const localData = localStorage.getItem('tuya_config');
  return localData ? JSON.parse(localData) : null;
};

let discoveredUserIdCache: string | null = null;

/**
 * Discover user document UID in Firestore when unauthenticated or when
 * auth.currentUser.uid has no history docs (matching Flutter's _discoverUserUid).
 */
export const discoverFirestoreUserId = async (): Promise<string | null> => {
  if (discoveredUserIdCache) return discoveredUserIdCache;
  try {
    const colRef = collection(db, 'artifacts', 'smart-home-apps', 'users');
    const snap = await getDocs(colRef);
    if (!snap.empty) {
      discoveredUserIdCache = snap.docs[0].id;
      return discoveredUserIdCache;
    }
  } catch (e) {
    console.warn('Error discovering Firestore user ID:', e);
  }
  return null;
};

// Query daily energy history from Firestore collection
export const fetchFirestoreDailyPowerStats = async (
  userId?: string
): Promise<{ date: string; kwh: number; peakKw: number; cost: number; hourly?: number[] }[]> => {
  try {
    let targetUid = userId?.trim() || auth.currentUser?.uid;
    if (!targetUid) {
      targetUid = (await discoverFirestoreUserId()) || undefined;
    }
    if (!targetUid) return [];

    let colRef = collection(db, 'artifacts', 'smart-home-apps', 'users', targetUid, 'energyHistory');
    let querySnapshot = await getDocs(colRef);

    // Fallback: If query with targetUid returns 0 docs, try discovering another user ID document in Firestore
    if (querySnapshot.empty) {
      const discovered = await discoverFirestoreUserId();
      if (discovered && discovered !== targetUid) {
        colRef = collection(db, 'artifacts', 'smart-home-apps', 'users', discovered, 'energyHistory');
        querySnapshot = await getDocs(colRef);
      }
    }
    
    return querySnapshot.docs.map(doc => {
      const data = doc.data();
      const kwh = Number(data.kwh) || 0;
      // Default fallback calculations for peak demand and approximate billing costs if not stored
      const peakKw = data.peakKw !== undefined ? Number(data.peakKw) : Number((kwh * 0.15).toFixed(1));
      const cost = data.cost !== undefined ? Number(data.cost) : Number((kwh * 0.15).toFixed(2));
      return {
        date: doc.id, // YYYY-MM-DD
        kwh,
        peakKw,
        cost,
        hourly: data.hourly
      };
    }).sort((a, b) => a.date.localeCompare(b.date));
  } catch (error) {
    console.error("Error fetching Firestore daily stats:", error);
    return [];
  }
};

// Query daily climate history from Firestore collection
export const fetchFirestoreDailyClimateStats = async (
  userId?: string
): Promise<{ date: string; sensors: any }[]> => {
  try {
    let targetUid = userId?.trim() || auth.currentUser?.uid;
    if (!targetUid) {
      targetUid = (await discoverFirestoreUserId()) || undefined;
    }
    if (!targetUid) return [];

    let colRef = collection(db, 'artifacts', 'smart-home-apps', 'users', targetUid, 'climateHistory');
    let querySnapshot = await getDocs(colRef);

    // Fallback: If query with targetUid returns 0 docs, try discovering another user ID document in Firestore
    if (querySnapshot.empty) {
      const discovered = await discoverFirestoreUserId();
      if (discovered && discovered !== targetUid) {
        colRef = collection(db, 'artifacts', 'smart-home-apps', 'users', discovered, 'climateHistory');
        querySnapshot = await getDocs(colRef);
      }
    }
    
    return querySnapshot.docs.map(doc => {
      const data = doc.data();
      return {
        date: doc.id, // YYYY-MM-DD
        sensors: data.sensors || {}
      };
    }).sort((a, b) => a.date.localeCompare(b.date));
  } catch (error) {
    console.error("Error fetching Firestore daily climate stats:", error);
    return [];
  }
};

// Query hourly energy statistics for a single day from Firestore
export const fetchFirestoreDayPowerStats = async (
  userId: string,
  date: string
): Promise<any | null> => {
  try {
    const docRef = doc(db, 'artifacts', 'smart-home-apps', 'users', userId, 'energyHistory', date);
    const docSnap = await getDoc(docRef);
    if (docSnap.exists()) {
      const data = docSnap.data();
      return {
        kwh: Number(data.kwh) || 0,
        peakKw: data.peakKw !== undefined ? Number(data.peakKw) : 0,
        cost: data.cost !== undefined ? Number(data.cost) : 0,
        hourly: data.hourly || []
      };
    }
    return null;
  } catch (error) {
    console.error("Error fetching single day power stats from Firestore:", error);
    return null;
  }
};

// Query hourly climate statistics for a single day from Firestore
export const fetchFirestoreDayClimateStats = async (
  userId: string,
  date: string
): Promise<any | null> => {
  try {
    const docRef = doc(db, 'artifacts', 'smart-home-apps', 'users', userId, 'climateHistory', date);
    const docSnap = await getDoc(docRef);
    if (docSnap.exists()) {
      const data = docSnap.data();
      return {
        date: docSnap.id,
        sensors: data.sensors || {}
      };
    }
    return null;
  } catch (error) {
    console.error("Error fetching single day climate stats from Firestore:", error);
    return null;
  }
};

// Constant for SHA-256 of empty string
const EMPTY_BODY_SHA = 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855';

// Clear token cache
export const clearTokenCache = () => {
  localStorage.removeItem('tuya_access_token');
  localStorage.removeItem('tuya_token_expires_at');
};

// Worker mode toggle — device-local only, never synced to Firebase
export const getWorkerModeEnabled = (): boolean => {
  return localStorage.getItem('worker_mode_enabled') === 'true';
};

export const setWorkerModeEnabled = (val: boolean): void => {
  localStorage.setItem('worker_mode_enabled', val ? 'true' : 'false');
};

// Get Tuya Access Token
export const getAccessToken = async (config: TuyaConfig): Promise<string> => {
  const cachedToken = localStorage.getItem('tuya_access_token');
  const expiresAt = localStorage.getItem('tuya_token_expires_at');
  
  if (cachedToken && expiresAt && Number(expiresAt) > Date.now() + 120000) {
    return cachedToken;
  }

  const t = Date.now().toString();
  const path = '/v1.0/token?grant_type=1';
  
  const stringToSign = `GET\n${EMPTY_BODY_SHA}\n\n${path}`;
  const str = `${config.clientId}${t}${stringToSign}`;
  const sign = (await hmacSha256(config.clientSecret, str)).toUpperCase();

  const region = config.region || 'eu';
  const reqHeaders = {
    'client_id': config.clientId,
    'sign': sign,
    't': t,
    'sign_method': 'HMAC-SHA256'
  };
  const fetchUrl = constructFetchUrl(region, path, reqHeaders);
  
  const response = await fetch(fetchUrl, {
    method: 'GET',
    headers: reqHeaders
  });

  if (!response.ok) {
    throw new Error(`Token request failed with status ${response.status}`);
  }

  const data = await response.json();
  if (!data.success) {
    throw new Error(`Tuya API Error: ${data.msg || 'Unknown error fetching token'}`);
  }

  const { access_token, expire_time } = data.result;
  
  localStorage.setItem('tuya_access_token', access_token);
  localStorage.setItem('tuya_token_expires_at', (Date.now() + expire_time * 1000).toString());
  
  return access_token;
};

// Make signed Tuya API request
export const makeTuyaRequest = async (
  path: string,
  method: 'GET' | 'POST' | 'PUT' | 'DELETE' = 'GET',
  body: any = null
): Promise<any> => {
  // Sort query parameters alphabetically to satisfy Tuya's HMAC signing specification
  let [basePath, queryString] = path.split('?');
  if (queryString) {
    const params = new URLSearchParams(queryString);
    const sortedKeys = Array.from(params.keys()).sort();
    const sortedParams = new URLSearchParams();
    sortedKeys.forEach(key => {
      const values = params.getAll(key);
      values.forEach(val => sortedParams.append(key, val));
    });
    // Decode percent-encoded parameters to match Tuya's raw signature requirements
    path = `${basePath}?${decodeURIComponent(sortedParams.toString())}`;
  }

  const config = await getTuyaConfig();
  if (!config || !config.clientId || !config.clientSecret) {
    throw new Error("Tuya credentials not configured. Please complete setup in Settings.");
  }

  const accessToken = await getAccessToken(config);
  const t = Date.now().toString();
  
  let contentSha = EMPTY_BODY_SHA;
  let bodyStr = '';
  if (body) {
    bodyStr = JSON.stringify(body);
    contentSha = await sha256(bodyStr);
  }

  const stringToSign = `${method}\n${contentSha}\n\n${path}`;
  const str = `${config.clientId}${accessToken}${t}${stringToSign}`;
  const sign = (await hmacSha256(config.clientSecret, str)).toUpperCase();

  const region = config.region || 'eu';
  const headers: Record<string, string> = {
    'client_id': config.clientId,
    'access_token': accessToken,
    'sign': sign,
    't': t,
    'sign_method': 'HMAC-SHA256'
  };

  if (body) {
    headers['Content-Type'] = 'application/json';
  }

  const fetchUrl = constructFetchUrl(region, path, headers);

  const response = await fetch(fetchUrl, {
    method,
    headers,
    body: body ? bodyStr : undefined
  });

  if (!response.ok) {
    throw new Error(`API Request failed with status ${response.status}`);
  }

  const data = await response.json();
  return data;
};

// Fetch status for a specific device
export const getDeviceStatus = async (deviceId: string): Promise<any[]> => {
  const data = await makeTuyaRequest(`/v1.0/devices/${deviceId}/status`, 'GET');
  if (!data.success) {
    throw new Error(data.msg || `Failed to fetch device status for ${deviceId}`);
  }
  return data.result;
};

// Fetch general device details
export const getDeviceDetails = async (deviceId: string): Promise<any> => {
  const data = await makeTuyaRequest(`/v1.0/devices/${deviceId}`, 'GET');
  if (!data.success) {
    throw new Error(data.msg || `Failed to fetch device details for ${deviceId}`);
  }
  return data.result;
};

// Fetch logs (history) for specific DP codes
export const getDeviceLogs = async (
  deviceId: string,
  dpCodes: string,
  startHourTime: number,
  endHourTime: number
): Promise<any> => {
  const query = `?codes=${dpCodes}&start_time=${startHourTime}&end_time=${endHourTime}&size=1000`;
  const data = await makeTuyaRequest(`/v1.0/devices/${deviceId}/logs${query}`, 'GET');
  if (!data.success) {
    throw new Error(data.msg || `Failed to fetch logs for ${deviceId}`);
  }
  return data.result;
};

// Diagnostic test for all credentials & devices
export const testFullConnection = async (config: TuyaConfig): Promise<{
  token: boolean;
  tokenError?: string;
  devices: {
    temp1: { success: boolean; msg: string };
    temp2: { success: boolean; msg: string };
    power: { success: boolean; msg: string };
  };
}> => {
  const result = {
    token: false,
    tokenError: '',
    devices: {
      temp1: { success: false, msg: 'Not configured' },
      temp2: { success: false, msg: 'Not configured' },
      power: { success: false, msg: 'Not configured' }
    }
  };

  try {
    const token = await getAccessToken(config);
    result.token = true;

    const fetchStatusForTest = async (deviceId: string) => {
      const t = Date.now().toString();
      const path = `/v1.0/devices/${deviceId}/status`;
      const stringToSign = `GET\n${EMPTY_BODY_SHA}\n\n${path}`;
      const str = `${config.clientId}${token}${t}${stringToSign}`;
      const sign = (await hmacSha256(config.clientSecret, str)).toUpperCase();
      
      const region = config.region || 'eu';
      const headers = {
        'client_id': config.clientId,
        'access_token': token,
        'sign': sign,
        't': t,
        'sign_method': 'HMAC-SHA256'
      };
      const fetchUrl = constructFetchUrl(region, path, headers);
      const res = await fetch(fetchUrl, {
        method: 'GET',
        headers
      });
      return await res.json();
    };

    if (config.tempDeviceId1) {
      try {
        const res = await fetchStatusForTest(config.tempDeviceId1);
        if (res.success) {
          const code = config.tempCode1 || 'va_temperature';
          const temp = res.result.find((s: any) => s.code === code || s.code === 'temp_current');
          const valStr = temp ? `${temp.value > 100 ? temp.value / 10 : temp.value}°C` : 'N/A';
          result.devices.temp1 = {
            success: true,
            msg: `Online. Temp reading: ${valStr}`
          };
        } else {
          result.devices.temp1 = { success: false, msg: `${res.msg} (Code ${res.code})` };
        }
      } catch (e: any) {
        result.devices.temp1 = { success: false, msg: `Failed: ${e.message}` };
      }
    }

    if (config.tempDeviceId2) {
      try {
        const res = await fetchStatusForTest(config.tempDeviceId2);
        if (res.success) {
          const code = config.tempCode2 || 'va_temperature';
          const temp = res.result.find((s: any) => s.code === code || s.code === 'temp_current');
          const valStr = temp ? `${temp.value > 100 ? temp.value / 10 : temp.value}°C` : 'N/A';
          result.devices.temp2 = {
            success: true,
            msg: `Online. Temp reading: ${valStr}`
          };
        } else {
          result.devices.temp2 = { success: false, msg: `${res.msg} (Code ${res.code})` };
        }
      } catch (e: any) {
        result.devices.temp2 = { success: false, msg: `Failed: ${e.message}` };
      }
    }

    if (config.powerDeviceId) {
      try {
        const res = await fetchStatusForTest(config.powerDeviceId);
        if (res.success) {
          const code = config.powerCode || 'cur_power';
          const pwr = res.result.find((s: any) => s.code === code || s.code === 'power');
          const valStr = pwr ? `${pwr.value > 10000 ? pwr.value / 10 : pwr.value} W` : 'N/A';
          result.devices.power = {
            success: true,
            msg: `Online. Load reading: ${valStr}`
          };
        } else {
          result.devices.power = { success: false, msg: `${res.msg} (Code ${res.code})` };
        }
      } catch (e: any) {
        result.devices.power = { success: false, msg: `Failed: ${e.message}` };
      }
    }
  } catch (error: any) {
    result.token = false;
    result.tokenError = error.message || 'Verification failed.';
  }

  return result;
};
