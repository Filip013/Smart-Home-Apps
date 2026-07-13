import os
import sys
import json
import hmac
import hashlib
import calendar
import requests
from datetime import datetime, timedelta, time, timezone
from zoneinfo import ZoneInfo
import firebase_admin
from firebase_admin import credentials, firestore

# Retrieve secrets from GitHub Action runner env
client_id = os.environ.get('TUYA_CLIENT_ID')
client_secret = os.environ.get('TUYA_CLIENT_SECRET')
user_uid = os.environ.get('FIREBASE_USER_UID')
service_account_str = os.environ.get('FIREBASE_SERVICE_ACCOUNT')

if not all([client_id, client_secret, user_uid, service_account_str]):
    print("Error: Missing required environment variables (secrets).")
    sys.exit(1)

# Initialize Firebase Admin SDK
try:
    service_account_info = json.loads(service_account_str)
    cred = credentials.Certificate(service_account_info)
    firebase_admin.initialize_app(cred)
    db = firestore.client()
except Exception as e:
    print(f"Error initializing Firebase Admin SDK: {e}")
    sys.exit(1)

# Fetch user config from Firestore
try:
    config_ref = db.document(f'artifacts/smart-home-apps/users/{user_uid}/settings/tuya')
    config_doc = config_ref.get()
    if not config_doc.exists:
        print(f"Configuration document not found in Firestore for UID: {user_uid}")
        sys.exit(1)
    config = config_doc.to_dict()
except Exception as e:
    print(f"Error fetching config from Firestore: {e}")
    sys.exit(1)

region_code = config.get('region', 'eu')
domain_map = {
    'us': 'openapi.tuyaus.com',
    'eu': 'openapi.tuyaeu.com',
    'eu-west': 'openapi-weaz.tuyaeu.com',
    'cn': 'openapi.tuyacn.com',
    'in': 'openapi.tuyain.com'
}
target_domain = domain_map.get(region_code, 'openapi.tuyaeu.com')

# sliding window setup (Last 13 Hours in UTC to avoid Tuya's older corrupted/zero values)
end_time_ms = int(datetime.utcnow().timestamp() * 1000)
start_time_ms = end_time_ms - 13 * 60 * 60 * 1000

print(f"Sliding query window (UTC): {datetime.utcfromtimestamp(start_time_ms/1000.0)} to {datetime.utcfromtimestamp(end_time_ms/1000.0)}")

def get_sha256(data_str):
    return hashlib.sha256(data_str.encode('utf-8')).hexdigest()

def get_hmac_sha256(key, message):
    return hmac.new(key.encode('utf-8'), message.encode('utf-8'), hashlib.sha256).hexdigest().upper()

def make_tuya_request(path, method='GET', body=None, token=''):
    t = str(int(datetime.utcnow().timestamp() * 1000))
    content_sha = 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855'
    body_str = ''
    if body:
        body_str = json.dumps(body)
        content_sha = get_sha256(body_str)

    # Sort query string for signature (Tuya specifications)
    sorted_path = path
    if '?' in path:
        base_path, query_str = path.split('?', 1)
        params = [p.split('=', 1) for p in query_str.split('&') if '=' in p]
        params = [(p[0], requests.utils.unquote(p[1])) for p in params]
        params.sort(key=lambda x: x[0])
        sorted_query = '&'.join([f"{p[0]}={p[1]}" for p in params])
        sorted_path = f"{base_path}?{sorted_query}"

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

# Obtain Tuya access token
token_res = make_tuya_request('/v1.0/token?grant_type=1', 'GET')
if not token_res.get('success'):
    print(f"Failed to fetch Tuya API access token: {token_res.get('msg')}")
    sys.exit(1)

access_token = token_res['result']['access_token']

# ----------------- SECTION 1: POWER STATISTICS RECORDING -----------------
power_device_id = config.get('powerDeviceId')
energy_code = config.get('energyCode', 'add_ele')

if power_device_id:
    print(f"\nProcessing Energy Logs for device {power_device_id}...")
    # Fetch energy logs for the last 24h (type=7 for DP Reports)
    power_logs_res = make_tuya_request(
        f"/v1.0/devices/{power_device_id}/logs?codes={energy_code}&start_time={start_time_ms}&end_time={end_time_ms}&size=100&type=7",
        'GET',
        None,
        access_token
    )

    if power_logs_res.get('success'):
        logs = power_logs_res.get('result', {}).get('logs', [])
        print(f"Retrieved {len(logs)} energy logs.")
        
        # Group logs by date (converting UTC timestamp to Europe/Belgrade timezone)
        logs_by_date = {}
        for log in logs:
            dt_utc = datetime.fromtimestamp(int(log['event_time']) / 1000.0, tz=timezone.utc)
            dt_local = dt_utc.astimezone(ZoneInfo("Europe/Belgrade"))
            date_key = dt_local.strftime('%Y-%m-%d')
            if date_key not in logs_by_date:
                logs_by_date[date_key] = []
            logs_by_date[date_key].append(log)
            
        for date_str, date_logs in logs_by_date.items():
            print(f"Merging Energy history for Date: {date_str} ({len(date_logs)} logs)")
            sorted_logs = sorted(date_logs, key=lambda x: int(x['event_time']))
            
            # Detect if cumulative or incremental (add_ele is always incremental)
            is_cumulative = True
            if energy_code == 'add_ele':
                is_cumulative = False
            else:
                last_val = -1
                for log in sorted_logs:
                    val = float(log['value'])
                    if last_val != -1 and val < last_val:
                        is_cumulative = False
                        break
                    last_val = val
                
            # Scale is 1000.0 for add_ele (thousandths of a kWh)
            scale = 1000.0

            # Get existing document from Firestore to merge
            energy_ref = db.document(f'artifacts/smart-home-apps/users/{user_uid}/energyHistory/{date_str}')
            energy_doc = energy_ref.get()
            
            if energy_doc.exists:
                doc_data = energy_doc.to_dict()
                start_val = doc_data.get('start_val', 0.0)
                last_readings = doc_data.get('last_readings', [0.0] * 24)
                hourly_kwh = doc_data.get('hourly', [0.0] * 24)
            else:
                start_val = 0.0
                last_readings = [0.0] * 24
                hourly_kwh = [0.0] * 24

            # Group date logs by hour
            by_hour = {h: [] for h in range(24)}
            for log in sorted_logs:
                dt_utc = datetime.fromtimestamp(int(log['event_time']) / 1000.0, tz=timezone.utc)
                dt_local = dt_utc.astimezone(ZoneInfo("Europe/Belgrade"))
                by_hour[dt_local.hour].append(float(log['value']))

            if is_cumulative:
                if start_val == 0.0 and len(sorted_logs) > 0:
                    start_val = float(sorted_logs[0]['value'])
                
                # Update last readings for active hours
                current_reading = start_val
                for h in range(24):
                    if len(by_hour[h]) > 0:
                        last_readings[h] = by_hour[h][-1]
                    elif last_readings[h] == 0.0:
                        if h > 0:
                            last_readings[h] = last_readings[h-1]
                        else:
                            last_readings[h] = start_val

                # Calculate cumulative consumption per hour
                prev_val = start_val
                for h in range(24):
                    diff = max(0.0, last_readings[h] - prev_val)
                    hourly_kwh[h] = round(diff / scale, 3)
                    prev_val = last_readings[h]
            else:
                # Incremental: overwrite hours with new data
                for h in range(24):
                    if len(by_hour[h]) > 0:
                        hourly_kwh[h] = round(sum(by_hour[h]) / scale, 3)

            kwh = round(sum(hourly_kwh), 1)
            
            # Calculate cost using High/Low Tariff schedule in RSD:
            # Low Tariff (Night): 00:00 to 07:59 -> 4.15 RSD/kWh
            # High Tariff (Day): 08:00 to 23:59 -> 13.45 RSD/kWh
            cost = 0.0
            for h in range(24):
                h_kwh = hourly_kwh[h]
                if h >= 0 and h < 8:
                    cost += h_kwh * 4.15
                else:
                    cost += h_kwh * 13.45
            cost = round(cost, 2)
            
            # Peak kW estimation
            peak_kw = round(max(hourly_kwh) * 4 if len(hourly_kwh) > 0 else kwh * 0.15, 1)

            print(f"Calculated -> Total kWh: {kwh}, Cost: {cost}")

            # Save merged record to Firestore
            energy_ref.set({
                'kwh': kwh,
                'peakKw': peak_kw,
                'cost': cost,
                'start_val': start_val,
                'last_readings': last_readings,
                'hourly': hourly_kwh
            })
            print(f"Saved merged energy history to Firestore for date '{date_str}'.")
    else:
        print(f"Error fetching Tuya power logs: {power_logs_res.get('msg')}")
else:
    print("\nSkipping power history: No power meter device ID configured.")


# ----------------- SECTION 2: CLIMATE STATISTICS RECORDING -----------------
# Setup sensors mapping
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
    print(f"\nProcessing Climate Logs for device {sensor['id']} ({sensor['key']})...")
    # Fetch logs for temperature and humidity (type=7 for DP Reports)
    codes_str = f"{sensor['temp_code']},{sensor['hum_code']}"
    climate_res = make_tuya_request(
        f"/v1.0/devices/{sensor['id']}/logs?codes={codes_str}&start_time={start_time_ms}&end_time={end_time_ms}&size=100&type=7",
        'GET',
        None,
        access_token
    )

    if climate_res.get('success'):
        logs = climate_res.get('result', {}).get('logs', [])
        print(f"Retrieved {len(logs)} climate logs.")
        
        # Group logs by date (converting UTC timestamp to Europe/Belgrade timezone)
        logs_by_date = {}
        for log in logs:
            dt_utc = datetime.fromtimestamp(int(log['event_time']) / 1000.0, tz=timezone.utc)
            dt_local = dt_utc.astimezone(ZoneInfo("Europe/Belgrade"))
            date_key = dt_local.strftime('%Y-%m-%d')
            if date_key not in logs_by_date:
                logs_by_date[date_key] = []
            logs_by_date[date_key].append(log)
            
        for date_str, date_logs in logs_by_date.items():
            print(f"Merging Climate history for Date: {date_str} ({len(date_logs)} logs)")
            
            # Get existing climate document from Firestore
            climate_ref = db.document(f'artifacts/smart-home-apps/users/{user_uid}/climateHistory/{date_str}')
            climate_doc = climate_ref.get()
            
            if climate_doc.exists:
                doc_data = climate_doc.to_dict()
                climate_data = doc_data.get('sensors', {})
                sensor_stats = climate_data.get(sensor['key'], {})
                hourly_list = sensor_stats.get('hourly', [])
                hourly_dict = {item['hour']: item for item in hourly_list}
            else:
                climate_data = {}
                sensor_stats = {}
                hourly_dict = {}

            # Group date logs by hour
            by_hour = {h: {'temps': [], 'hums': []} for h in range(24)}
            all_temps = []
            all_hums = []
            
            for log in date_logs:
                val = float(log['value'])
                dt_utc = datetime.fromtimestamp(int(log['event_time']) / 1000.0, tz=timezone.utc)
                dt_local = dt_utc.astimezone(ZoneInfo("Europe/Belgrade"))
                h = dt_local.hour
                if log['code'] == sensor['temp_code']:
                    val_scaled = val / 10.0 if val > 100.0 else val
                    by_hour[h]['temps'].append(val_scaled)
                    all_temps.append(val_scaled)
                elif log['code'] == sensor['hum_code']:
                    val_scaled = val / 10.0 if val > 100.0 else val
                    by_hour[h]['hums'].append(val_scaled)
                    all_hums.append(val_scaled)

            # Sort date logs to get initial carry-forward values
            sorted_temp_logs = sorted([l for l in date_logs if l['code'] == sensor['temp_code']], key=lambda x: int(x['event_time']))
            sorted_hum_logs = sorted([l for l in date_logs if l['code'] == sensor['hum_code']], key=lambda x: int(x['event_time']))

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

            # Merge and update hourly dict
            for h in range(24):
                has_data = len(by_hour[h]['temps']) > 0 or len(by_hour[h]['hums']) > 0
                if has_data:
                    h_temp = sum(by_hour[h]['temps']) / len(by_hour[h]['temps']) if len(by_hour[h]['temps']) > 0 else (hourly_dict.get(h, {}).get('temp') or last_temp)
                    h_hum = sum(by_hour[h]['hums']) / len(by_hour[h]['hums']) if len(by_hour[h]['hums']) > 0 else (hourly_dict.get(h, {}).get('humidity') or last_hum)
                    
                    hourly_dict[h] = {
                        'hour': h,
                        'temp': round(h_temp, 1) if h_temp is not None else None,
                        'humidity': int(round(h_hum)) if h_hum is not None else None
                    }
                else:
                    # Carry forward if not already in hourly_dict
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

            # Build final sorted list of 24 hourly values
            final_hourly = [hourly_dict[h] for h in range(24)]
            
            # Recompute daily aggregates from merged hourly values
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
            print(f"Merged Climate Stats: {sensor_stats}")

            # Save back to Firestore
            climate_ref.set({
                'date': date_str,
                'sensors': climate_data
            }, merge=True)
            print(f"Saved merged climate history to Firestore for date '{date_str}'.")
    else:
        print(f"Error fetching Tuya climate logs: {climate_res.get('msg')}")

print("\nHistory recording run completed successfully.")
