import os
import sys
import json
import hmac
import hashlib
import calendar
import requests
from datetime import datetime, timedelta, time
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

# Timestamps boundary setup (Yesterday UTC 00:00:00 to 23:59:59)
yesterday = datetime.utcnow() - timedelta(days=1)
start_of_yesterday = datetime.combine(yesterday, time.min)
end_of_yesterday = datetime.combine(yesterday, time.max)

start_time_ms = int(calendar.timegm(start_of_yesterday.timetuple()) * 1000)
end_time_ms = int(calendar.timegm(end_of_yesterday.timetuple()) * 1000)
date_str = yesterday.strftime('%Y-%m-%d') # YYYY-MM-DD

print(f"Recording history for Date: {date_str}")
print(f"Query window (UTC): {start_of_yesterday} to {end_of_yesterday}")
print(f"Epoch Milliseconds: {start_time_ms} - {end_time_ms}")

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
    # Fetch energy logs for yesterday (type=7 for DP Reports)
    power_logs_res = make_tuya_request(
        f"/v1.0/devices/{power_device_id}/logs?codes={energy_code}&start_time={start_time_ms}&end_time={end_time_ms}&size=100&type=7",
        'GET',
        None,
        access_token
    )

    if power_logs_res.get('success'):
        logs = power_logs_res.get('result', {}).get('logs', [])
        print(f"Retrieved {len(logs)} energy logs.")
        
        if len(logs) > 0:
            # Sort oldest to newest
            sorted_logs = sorted(logs, key=lambda x: int(x['event_time']))
            
            # Detect if cumulative or incremental
            is_cumulative = True
            last_val = -1
            for log in sorted_logs:
                val = float(log['value'])
                if last_val != -1 and val < last_val:
                    is_cumulative = False
                    break
                last_val = val
                
            raw_energy = 0
            if is_cumulative:
                # Cumulative: end value - start value of the day
                start_val = float(sorted_logs[0]['value'])
                end_val = float(sorted_logs[-1]['value'])
                raw_energy = max(0.0, end_val - start_val)
                max_val = end_val
            else:
                # Incremental: sum all reports
                raw_energy = sum([float(log['value']) for log in sorted_logs])
                max_val = max([float(log['value']) for log in sorted_logs])

            # Detect scale factor based on max reading size
            scale = 100.0 # Default scale of 2 (0.01 kWh)
            if max_val > 1000.0:
                scale = 1000.0 # Wh to kWh

            kwh = round(raw_energy / scale, 1)
            peak_kw = round(kwh * 0.15, 1) # Estimated peak demand factor
            cost = round(kwh * 0.15, 2)    # Estimated billing rate ($0.15/kWh)

            print(f"Calculation Result -> kWh: {kwh}, peakKw: {peak_kw}, cost: {cost} (Scale Divisor: {scale})")

            # Save to Firestore
            energy_ref = db.document(f'artifacts/smart-home-apps/users/{user_uid}/energyHistory/{date_str}')
            energy_ref.set({
                'kwh': kwh,
                'peakKw': peak_kw,
                'cost': cost
            })
            print(f"Saved energy history to Firestore under document '{date_str}'.")
        else:
            print("No energy logs reported for yesterday.")
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

climate_data = {}

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
        
        temps = []
        hums = []
        
        for log in logs:
            val = float(log['value'])
            if log['code'] == sensor['temp_code']:
                # Scale temp
                temps.append(val / 10.0 if val > 100.0 else val)
            elif log['code'] == sensor['hum_code']:
                # Scale humidity
                hums.append(val / 10.0 if val > 100.0 else val)
                
        if len(temps) > 0 or len(hums) > 0:
            sensor_stats = {}
            if len(temps) > 0:
                sensor_stats['avgTemp'] = round(sum(temps) / len(temps), 1)
                sensor_stats['minTemp'] = round(min(temps), 1)
                sensor_stats['maxTemp'] = round(max(temps), 1)
            if len(hums) > 0:
                sensor_stats['avgHumidity'] = int(round(sum(hums) / len(hums)))
                
            climate_data[sensor['key']] = sensor_stats
            print(f"Climate Stats computed: {sensor_stats}")
        else:
            print("No climate entries found in logs for yesterday.")
    else:
        print(f"Error fetching Tuya climate logs: {climate_res.get('msg')}")

if len(climate_data) > 0:
    # Save climate snapshot to Firestore
    climate_ref = db.document(f'artifacts/smart-home-apps/users/{user_uid}/climateHistory/{date_str}')
    climate_ref.set({
        'date': date_str,
        'sensors': climate_data
    })
    print(f"\nSaved climate history to Firestore under document '{date_str}'.")
else:
    print("\nSkipping climate history: No climate logs gathered or no devices configured.")

print("\nHistory recording run completed successfully.")
