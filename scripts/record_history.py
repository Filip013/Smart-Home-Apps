import os
import sys
import json
import hmac
import hashlib
import urllib.parse
from datetime import datetime, timedelta, timezone
try:
    from zoneinfo import ZoneInfo
    BELGRADE_TZ = ZoneInfo("Europe/Belgrade")
except Exception:
    BELGRADE_TZ = timezone(timedelta(hours=2))

import requests
import firebase_admin
from firebase_admin import credentials, firestore

# 1. Retrieve ONLY the Firebase secret from GitHub Action runner env
service_account_str = os.environ.get('FIREBASE_SERVICE_ACCOUNT')

if not service_account_str or not str(service_account_str).strip():
    print("Error: Missing required environment variable: FIREBASE_SERVICE_ACCOUNT")
    sys.exit(1)

# 2. Initialize Firebase Admin SDK
try:
    service_account_info = json.loads(service_account_str)
    if isinstance(service_account_info, dict) and 'private_key' in service_account_info:
        service_account_info['private_key'] = service_account_info['private_key'].replace('\\n', '\n')
    
    cred = credentials.Certificate(service_account_info)
    firebase_admin.initialize_app(cred)
    db = firestore.client()
except Exception as e:
    print(f"Error initializing Firebase Admin SDK: {e}")
    sys.exit(1)

# Domain mapping for Tuya Regions
domain_map = {
    'us': 'openapi.tuyaus.com',
    'eu': 'openapi.tuyaeu.com',
    'eu-west': 'openapi-weaz.tuyaeu.com',
    'cn': 'openapi.tuyacn.com',
    'in': 'openapi.tuyain.com'
}

# Target dates to process explicitly: Yesterday (full 24h) and Today so far
now_belgrade = datetime.now(BELGRADE_TZ)
today_date = now_belgrade.date()
yesterday_date = today_date - timedelta(days=1)

target_dates = [
    yesterday_date.strftime('%Y-%m-%d'),
    today_date.strftime('%Y-%m-%d')
]

print(f"Target recording dates (Belgrade local time): {target_dates}")

# Helpers
def get_sha256(data_str):
    return hashlib.sha256(data_str.encode('utf-8')).hexdigest()

def get_hmac_sha256(key, message):
    return hmac.new(key.encode('utf-8'), message.encode('utf-8'), hashlib.sha256).hexdigest().upper()

# Dynamic Tuya Request (requires passing user creds)
def make_tuya_request(path, client_id, client_secret, target_domain, method='GET', body=None, token=''):
    t = str(int(datetime.now(timezone.utc).timestamp() * 1000))
    content_sha = 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855'
    body_str = ''
    if body:
        body_str = json.dumps(body)
        content_sha = get_sha256(body_str)

    sorted_path = path
    if '?' in path:
        base_path, query_str = path.split('?', 1)
        params = [p.split('=', 1) for p in query_str.split('&') if '=' in p]
        params.sort(key=lambda x: x[0])
        
        sorted_url_query = '&'.join([f"{p[0]}={p[1]}" for p in params])
        path = f"{base_path}?{sorted_url_query}"
        
        decoded_query = '&'.join([f"{p[0]}={urllib.parse.unquote(p[1])}" for p in params])
        sorted_path = f"{base_path}?{decoded_query}"

    string_to_sign = f"{method}\n{content_sha}\n\n{sorted_path}"
    sign_str = f"{client_id}{token}{t}{string_to_sign}"
    sign = get_hmac_sha256(client_secret, sign_str)

    headers = {
        'client_id': client_id,
        'sign': sign,
        't': t,
        'sign_method': 'HMAC-SHA256'
    }
    if token:
        headers['access_token'] = token
    if body:
        headers['Content-Type'] = 'application/json'

    url = f"https://{target_domain}{path}"
    res = requests.request(method, url, headers=headers, data=body_str if body else None)
    return res.json()


# 3. Main Processing Logic per User
def process_user(user_uid, config):
    client_id = config.get('clientId')
    client_secret = config.get('clientSecret')
    
    if not client_id or not client_secret:
        print(f"[{user_uid}] Skipping: Missing clientId or clientSecret in configuration.")
        return

    region_code = config.get('region', 'eu')
    target_domain = domain_map.get(region_code, 'openapi.tuyaeu.com')
    
    print(f"\n=============================================")
    print(f"Processing User: {user_uid} (Region: {region_code})")
    print(f"=============================================")

    # Obtain Tuya access token for this user
    token_res = make_tuya_request('/v1.0/token?grant_type=1', client_id, client_secret, target_domain, 'GET')
    if not token_res.get('success'):
        print(f"[{user_uid}] Failed to fetch Tuya API access token: {token_res.get('msg')}")
        return

    access_token = token_res['result']['access_token']

    # ----------------- SECTION 1: POWER STATISTICS RECORDING -----------------
    power_device_id = config.get('powerDeviceId')
    energy_code = config.get('energyCode', 'add_ele')

    if power_device_id:
        print(f"[{user_uid}] Processing Energy Logs for device {power_device_id}...")
        
        for date_str in target_dates:
            year, month, day = map(int, date_str.split('-'))
            dt_start = datetime(year, month, day, 0, 0, 0, tzinfo=BELGRADE_TZ)
            dt_end = dt_start + timedelta(days=1)
            
            start_ms = int(dt_start.timestamp() * 1000)
            end_ms = int(dt_end.timestamp() * 1000)
            
            logs = []
            last_row_key = ''
            has_more = True
            page_count = 0
            success = True
            err_msg = ""
            
            while has_more and page_count < 10:
                row_key_param = f"&last_row_key={urllib.parse.quote(last_row_key)}" if last_row_key else ""
                path = f"/v2.0/cloud/thing/{power_device_id}/report-logs?codes={energy_code}&start_time={start_ms}&end_time={end_ms}&size=100{row_key_param}"
                res = make_tuya_request(path, client_id, client_secret, target_domain, 'GET', None, access_token)
                
                if not res.get('success'):
                    success = False
                    err_msg = res.get('msg', 'Unknown error')
                    break
                    
                result_data = res.get('result', {})
                page_logs = result_data.get('logs', [])
                logs.extend(page_logs)
                
                has_more = result_data.get('has_more', False)
                last_row_key = result_data.get('next_row_key') or result_data.get('last_row_key') or ''
                page_count += 1
                
                if not page_logs or not last_row_key:
                    break

            if success and len(logs) > 0:
                by_hour = [0.0] * 24
                for log in logs:
                    dt_utc = datetime.fromtimestamp(int(log['event_time']) / 1000.0, tz=timezone.utc)
                    dt_local = dt_utc.astimezone(BELGRADE_TZ)
                    if 0 <= dt_local.hour < 24:
                        by_hour[dt_local.hour] += float(log['value'])

                hourly_kwh = [round(v / 1000.0, 3) for v in by_hour]
                kwh = round(sum(hourly_kwh), 2)
                
                cost = 0.0
                for h in range(24):
                    h_kwh = hourly_kwh[h]
                    if 0 <= h < 8:
                        cost += h_kwh * 4.15
                    else:
                        cost += h_kwh * 13.45
                cost = round(cost, 2)
                
                peak_kw = round(max(hourly_kwh) * 4.0, 1) if len(hourly_kwh) > 0 else 0.0

                energy_ref = db.document(f'artifacts/smart-home-apps/users/{user_uid}/energyHistory/{date_str}')
                energy_ref.set({
                    'kwh': kwh,
                    'peakKw': peak_kw,
                    'cost': cost,
                    'start_val': 0.0,
                    'last_readings': [0.0] * 24,
                    'hourly': hourly_kwh
                }, merge=True)
                print(f"[{user_uid}] Power {date_str} -> {kwh} kWh | {cost} RSD | Peak {peak_kw} kW")
            else:
                print(f"[{user_uid}] No energy logs for '{date_str}' (Msg: {err_msg})")
    else:
        print(f"[{user_uid}] Skipping power history: No powerDeviceId configured.")


    # ----------------- SECTION 2: CLIMATE STATISTICS RECORDING -----------------
    sensors = []
    if config.get('tempDeviceId1'):
        sensors.append({
            'id': config['tempDeviceId1'],
            'key': 'sensor1',
            'temp_code': config.get('tempCode1', 'va_temperature'),
            'hum_code': config.get('humCode1', 'va_humidity')
        })
    if config.get('tempDeviceId2'):
        sensors.append({
            'id': config['tempDeviceId2'],
            'key': 'sensor2',
            'temp_code': config.get('tempCode2', 'va_temperature'),
            'hum_code': config.get('humCode2', 'va_humidity')
        })

    for sensor in sensors:
        codes_str = f"{sensor['temp_code']},{sensor['hum_code']}"
        
        for date_str in target_dates:
            year, month, day = map(int, date_str.split('-'))
            dt_start = datetime(year, month, day, 0, 0, 0, tzinfo=BELGRADE_TZ)
            dt_end = dt_start + timedelta(days=1)
            
            start_ms = int(dt_start.timestamp() * 1000)
            end_ms = int(dt_end.timestamp() * 1000)
            
            logs = []
            last_row_key = ''
            has_more = True
            page_count = 0
            success = True
            err_msg = ""
            
            while has_more and page_count < 10:
                row_key_param = f"&last_row_key={urllib.parse.quote(last_row_key)}" if last_row_key else ""
                path = f"/v2.0/cloud/thing/{sensor['id']}/report-logs?codes={codes_str}&start_time={start_ms}&end_time={end_ms}&size=100{row_key_param}"
                res = make_tuya_request(path, client_id, client_secret, target_domain, 'GET', None, access_token)
                
                if not res.get('success'):
                    success = False
                    err_msg = res.get('msg', 'Unknown error')
                    break
                    
                result_data = res.get('result', {})
                page_logs = result_data.get('logs', [])
                logs.extend(page_logs)
                
                has_more = result_data.get('has_more', False)
                last_row_key = result_data.get('next_row_key') or result_data.get('last_row_key') or ''
                page_count += 1
                
                if not page_logs or not last_row_key:
                    break

            if success and len(logs) > 0:
                climate_ref = db.document(f'artifacts/smart-home-apps/users/{user_uid}/climateHistory/{date_str}')
                climate_doc = climate_ref.get()
                
                if climate_doc.exists:
                    doc_data = climate_doc.to_dict()
                    climate_data = doc_data.get('sensors', {})
                    sensor_stats = climate_data.get(sensor['key'], {})
                    hourly_list = sensor_stats.get('hourly', [])
                    hourly_dict = {int(item['hour']): item for item in hourly_list if 'hour' in item}
                else:
                    climate_data = {}
                    sensor_stats = {}
                    hourly_dict = {}

                by_hour = {h: {'temps': [], 'hums': []} for h in range(24)}
                all_temps = []
                all_hums = []
                
                for log in logs:
                    val = float(log['value'])
                    dt_utc = datetime.fromtimestamp(int(log['event_time']) / 1000.0, tz=timezone.utc)
                    dt_local = dt_utc.astimezone(BELGRADE_TZ)
                    h = dt_local.hour
                    if log['code'] == sensor['temp_code']:
                        val_scaled = val / 10.0 if val > 100.0 else val
                        by_hour[h]['temps'].append(val_scaled)
                        all_temps.append(val_scaled)
                    elif log['code'] == sensor['hum_code']:
                        val_scaled = val / 10.0 if val > 100.0 else val
                        by_hour[h]['hums'].append(val_scaled)
                        all_hums.append(val_scaled)

                sorted_temp_logs = sorted([l for l in logs if l['code'] == sensor['temp_code']], key=lambda x: int(x['event_time']))
                sorted_hum_logs = sorted([l for l in logs if l['code'] == sensor['hum_code']], key=lambda x: int(x['event_time']))

                avg_temp_day = sum(all_temps) / len(all_temps) if len(all_temps) > 0 else None
                avg_hum_day = sum(all_hums) / len(all_hums) if len(all_hums) > 0 else None

                last_temp = avg_temp_day
                if len(sorted_temp_logs) > 0:
                    v = float(sorted_temp_logs[0]['value'])
                    last_temp = v / 10.0 if v > 100.0 else v

                last_hum = avg_hum_day
                if len(sorted_hum_logs) > 0:
                    v = float(sorted_hum_logs[0]['value'])
                    last_hum = v / 10.0 if v > 100.0 else v

                for h in range(24):
                    has_data = len(by_hour[h]['temps']) > 0 or len(by_hour[h]['hums']) > 0
                    if has_data:
                        fallback_temp = hourly_dict.get(h, {}).get('temp')
                        if fallback_temp is None:
                            fallback_temp = last_temp
                        h_temp = sum(by_hour[h]['temps']) / len(by_hour[h]['temps']) if len(by_hour[h]['temps']) > 0 else fallback_temp

                        fallback_hum = hourly_dict.get(h, {}).get('humidity')
                        if fallback_hum is None:
                            fallback_hum = last_hum
                        h_hum = sum(by_hour[h]['hums']) / len(by_hour[h]['hums']) if len(by_hour[h]['hums']) > 0 else fallback_hum
                        
                        hourly_dict[h] = {
                            'hour': h,
                            'temp': round(h_temp, 1) if h_temp is not None else None,
                            'humidity': int(round(h_hum)) if h_hum is not None else None
                        }
                    else:
                        if h not in hourly_dict:
                            if h > 0 and (h-1) in hourly_dict:
                                hourly_dict[h] = {
                                    'hour': h,
                                    'temp': hourly_dict[h-1]['temp'],
                                    'humidity': hourly_dict[h-1]['humidity']
                                }
                            else:
                                hourly_dict[h] = {
                                    'hour': h,
                                    'temp': round(last_temp, 1) if last_temp is not None else None,
                                    'humidity': int(round(last_hum)) if last_hum is not None else None
                                }

                final_hourly = [hourly_dict[h] for h in range(24)]
                valid_temps = [item['temp'] for item in final_hourly if item['temp'] is not None]
                valid_hums = [item['humidity'] for item in final_hourly if item['humidity'] is not None]
                
                if len(valid_temps) > 0:
                    sensor_stats['avgTemp'] = round(sum(valid_temps) / len(valid_temps), 1)
                    sensor_stats['minTemp'] = round(min(valid_temps), 1)
                    sensor_stats['maxTemp'] = round(max(valid_temps), 1)
                if len(valid_hums) > 0:
                    sensor_stats['avgHumidity'] = int(round(sum(valid_hums) / len(valid_hums)))

                sensor_stats['hourly'] = final_hourly
                climate_data[sensor['key']] = sensor_stats

                climate_ref.set({
                    'date': date_str,
                    'sensors': climate_data
                }, merge=True)
                print(f"[{user_uid}] Climate {sensor['key']} {date_str} -> Logs processed & saved.")
            else:
                print(f"[{user_uid}] No climate logs for {sensor['key']} on '{date_str}'.")

# 4. Fetch all users from Firestore and process them
try:
    print("\nFetching users from Firestore...")
    users_ref = db.collection('artifacts').document('smart-home-apps').collection('users')
    users = users_ref.stream()
    
    user_count = 0
    for user_doc in users:
        user_uid = user_doc.id
        config_ref = db.document(f'artifacts/smart-home-apps/users/{user_uid}/settings/tuya')
        config_doc = config_ref.get()
        
        if config_doc.exists:
            user_count += 1
            process_user(user_uid, config_doc.to_dict())
        else:
            print(f"[{user_uid}] No settings/tuya document found. Skipping.")

    print(f"\nSuccessfully processed {user_count} user(s).")
    print("History recording run completed successfully.")

except Exception as e:
    print(f"Fatal error querying users from Firestore: {e}")
    sys.exit(1)