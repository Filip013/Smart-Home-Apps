import os
import sys
import json
import time
import threading
import socket
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
import tinytuya

# Determine directory paths
DIR_PATH = os.path.dirname(os.path.realpath(__file__))
CONFIG_PATH = os.path.join(DIR_PATH, 'config.json')

# Default configuration template
DEFAULT_CONFIG = {
    "device_id": "YOUR_TUYA_DEVICE_ID",
    "local_key": "YOUR_TUYA_LOCAL_KEY",
    "device_ip": "192.168.1.X",
    "protocol_version": "3.3",
    "power_dps_index": "19",
    "voltage_dps_index": "20",
    "current_dps_index": "18",
    "server_port": 8080,
    "poll_interval_seconds": 1.0 
}

# Load configuration file
if not os.path.exists(CONFIG_PATH):
    print(f"Creating default config template at {CONFIG_PATH}")
    with open(CONFIG_PATH, 'w') as f:
        json.dump(DEFAULT_CONFIG, f, indent=2)
    print("Please configure config.json before starting the daemon.")
    sys.exit(1)

with open(CONFIG_PATH, 'r') as f:
    config = json.load(f)

# Extract config values
device_id = config.get('device_id')
local_key = config.get('local_key')
device_ip = config.get('device_ip')
protocol_version = float(config.get('protocol_version', 3.3))
power_dps = str(config.get('power_dps_index', '19'))
voltage_dps = str(config.get('voltage_dps_index', '20'))
current_dps = str(config.get('current_dps_index', '18'))
server_port = int(config.get('server_port', 8080))

# We use this as a minimum time between physical device queries to prevent overwhelming the plug
CACHE_TTL = float(config.get('poll_interval_seconds', 1.0))

# Load API secret for authorization
api_secret = config.get('api_secret')
if not api_secret:
    search_paths = [
        './tinytuya.json', '../tinytuya.json', '../../tinytuya.json',
        './tuya-realtime/tinytuya.json', os.path.expanduser('~/tinytuya.json'),
        os.path.expanduser('~/scripts/tinytuya.json')
    ]
    for path in search_paths:
        if os.path.exists(path):
            try:
                with open(path, 'r') as tf:
                    tdata = json.load(tf)
                    api_secret = tdata.get('apiSecret') or tdata.get('api_secret')
                    if api_secret:
                        print(f"Auto-loaded API Authorization Secret from: {os.path.abspath(path)}")
                        break
            except Exception as te:
                print(f"Warning: Failed to parse {path}: {te}")

if api_secret:
    print("Authorization status: ACTIVE (Matching Bearer token required for /live)")
else:
    print("Warning: No api_secret loaded. Local endpoint /live is UNPROTECTED.")

if device_id == "YOUR_TUYA_DEVICE_ID" or local_key == "YOUR_TUYA_LOCAL_KEY":
    print("Error: Please update config.json with your actual Tuya credentials.")
    sys.exit(1)

# Initialize TinyTuya outlet device
print(f"Initializing TinyTuya for Device {device_id[:6]}... at {device_ip}")
device = tinytuya.OutletDevice(
    dev_id=device_id,
    address=device_ip,
    local_key=local_key
)
device.set_version(protocol_version)
# Keep socket persistent so on-demand queries respond instantly instead of taking 1-2 seconds to handshake
device.set_socketPersistent(True) 
device.timeout = 1.0 

# Thread-safe lock and cache for on-demand requests
device_lock = threading.Lock()
last_fetch_time = 0
cached_state = {
    "currentLoad": 0.0,
    "voltage": 0.0,
    "currentAmps": 0.0,
    "status": "offline",
    "timestamp": 0
}

def fetch_device_data():
    """Queries the physical Tuya device. Must be called inside device_lock."""
    # Force the device to refresh and send its live values
    dps_indices = []
    if power_dps.isdigit(): dps_indices.append(int(power_dps))
    if voltage_dps.isdigit(): dps_indices.append(int(voltage_dps))
    if current_dps.isdigit(): dps_indices.append(int(current_dps))

    for attempt in range(2):
        try:
            if dps_indices:
                try:
                    device.updatedps(index=dps_indices)
                except Exception:
                    pass # Ignore update errors, proceed to status check

            # Query local status
            data = device.status()

            if 'error' in data:
                raise Exception(f"Local query error: {data['error']}")

            dps = data.get('dps', {})
            raw_power = dps.get(power_dps)
            raw_voltage = dps.get(voltage_dps)
            raw_current = dps.get(current_dps)

            if raw_power is not None:
                return {
                    "currentLoad": round(float(raw_power) / 10.0, 1),
                    "voltage": round(float(raw_voltage) / 10.0, 1) if raw_voltage is not None else 230.0,
                    "currentAmps": round(float(raw_current) / 1000.0, 2) if raw_current is not None else 0.0,
                    "status": "online",
                    "timestamp": int(time.time())
                }
            else:
                raise Exception(f"Power DPS {power_dps} missing from payload. Available: {list(dps.keys())}")

        except Exception as e:
            print(f"Device Query Attempt {attempt + 1} Failed: {e}")
            # Close connection to force socket recreation on the next attempt
            try:
                device.close()
            except:
                pass
            
            # If this was the first attempt, retry immediately
            if attempt == 0:
                print("Retrying query with a fresh socket...")
                continue
                
            # Both attempts failed, return the offline payload
            return {
                "currentLoad": 0.0,
                "voltage": 0.0,
                "currentAmps": 0.0,
                "status": "offline",
                "timestamp": int(time.time()),
                "error": str(e)
            }

# HTTP Request Handler to serve live data to the browser
class LocalLiveServer(BaseHTTPRequestHandler):
    def log_message(self, format, *args):
        # Mute standard HTTP logging to keep console clean
        return

    def do_OPTIONS(self):
        # Handle CORS pre-flight requests
        self.send_response(200)
        self.send_header('Access-Control-Allow-Origin', '*')
        self.send_header('Access-Control-Allow-Methods', 'GET, OPTIONS')
        self.send_header('Access-Control-Allow-Headers', 'Content-Type, Authorization')
        self.send_header('Access-Control-Max-Age', '86400')
        self.end_headers()

    def do_GET(self):
        if self.path == '/live':
            # Check Authorization
            if api_secret:
                auth_header = self.headers.get('Authorization')
                if not auth_header or auth_header != f"Bearer {api_secret}":
                    self.send_response(401)
                    self.send_header('Content-Type', 'application/json')
                    self.send_header('Access-Control-Allow-Origin', '*')
                    self.end_headers()
                    self.wfile.write(json.dumps({"error": "Unauthorized"}).encode('utf-8'))
                    return

            global last_fetch_time, cached_state

            current_time = time.time()
            if current_time - last_fetch_time >= CACHE_TTL:
                # Attempt to acquire the lock to fetch new data.
                # If another request thread is already querying the plug, we don't block;
                # we immediately serve the last known cached state to prevent request queuing.
                acquired = device_lock.acquire(blocking=False)
                if acquired:
                    try:
                        # Double-check freshness inside the lock
                        if time.time() - last_fetch_time >= CACHE_TTL:
                            cached_state = fetch_device_data()
                            last_fetch_time = time.time()
                    finally:
                        device_lock.release()

            response_data = json.dumps(cached_state)

            # Send HTTP Response
            self.send_response(200)
            self.send_header('Content-Type', 'application/json')
            self.send_header('Access-Control-Allow-Origin', '*')
            self.end_headers()
            self.wfile.write(response_data.encode('utf-8'))
        else:
            self.send_response(404)
            self.end_headers()

def get_local_ip():
    """Gets the local IP address of the machine running the script."""
    s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
    try:
        # Doesn't have to be reachable, just helps the OS determine the primary network interface
        s.connect(('10.255.255.255', 1))
        IP = s.getsockname()[0]
    except Exception:
        IP = '127.0.0.1'
    finally:
        s.close()
    return IP

def run_server():
    server_address = ('', server_port)
    httpd = ThreadingHTTPServer(server_address, LocalLiveServer)
    
    local_ip = get_local_ip()
    
    print(f"Server listening locally on port {server_port}...")
    print("Running in ON-DEMAND mode (Silent until requested).")
    print("-" * 50)
    print(f"Web app should fetch from: http://{local_ip}:{server_port}/live")
    print("-" * 50)
    print("Press Ctrl+C to terminate.")

    try:
        httpd.serve_forever()
    except KeyboardInterrupt:
        print("\nStopping server...")
        httpd.server_close()

if __name__ == '__main__':
    run_server()