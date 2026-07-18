import os
import sys
import json
import time
import threading
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
poll_interval = float(config.get('poll_interval_seconds', 1.5))

# Load API secret for authorization
api_secret = config.get('api_secret')
if not api_secret:
    # Try auto-detecting from tintuya.json or parent dirs
    for path in ['./tintuya.json', '../tintuya.json', './tuya-realtime/tintuya.json']:
        if os.path.exists(path):
            try:
                with open(path, 'r') as tf:
                    tdata = json.load(tf)
                    api_secret = tdata.get('apiSecret') or tdata.get('api_secret')
                    if api_secret:
                        print(f"Auto-loaded API Authorization Secret from {path}")
                        break
            except Exception as te:
                print(f"Warning: Failed to parse {path}: {te}")

if device_id == "YOUR_TUYA_DEVICE_ID" or local_key == "YOUR_TUYA_LOCAL_KEY":
    print("Error: Please update config.json with your actual Tuya credentials.")
    sys.exit(1)

# Thread-safe global store for the latest reading
live_state_lock = threading.Lock()
latest_live_state = {
    "currentLoad": 0.0,
    "voltage": 0.0,
    "currentAmps": 0.0,
    "status": "offline",
    "timestamp": 0
}

# Initialize TinyTuya outlet device
print(f"Initializing TinyTuya for Device {device_id[:6]}... at {device_ip}")
device = tinytuya.OutletDevice(
    dev_id=device_id,
    address=device_ip,
    local_key=local_key
)
device.set_version(protocol_version)
device.set_socketPersistent(True)  # Reuse socket for lower latency and better stability
device.timeout = 1.0                # Short timeout to prevent thread blocking on network lag

# Background thread to poll the Tuya device locally
def polling_worker():
    global latest_live_state
    print("Started background local polling thread...")
    consecutive_errors = 0
    
    while True:
        try:
            # Force the device to refresh and send its live values (otherwise Tuya plugs cache them)
            try:
                dps_indices = []
                if power_dps.isdigit(): dps_indices.append(int(power_dps))
                if voltage_dps.isdigit(): dps_indices.append(int(voltage_dps))
                if current_dps.isdigit(): dps_indices.append(int(current_dps))
                if dps_indices:
                    device.updatedps(index=dps_indices)
            except Exception as update_err:
                pass

            # Query local status
            data = device.status()
            
            if 'error' in data:
                raise Exception(f"Local query error: {data['error']}")
                
            dps = data.get('dps', {})
            
            # Extract raw values
            raw_power = dps.get(power_dps)
            raw_voltage = dps.get(voltage_dps)
            raw_current = dps.get(current_dps)
            
            if raw_power is not None:
                # Convert tenths of W -> W (e.g. 125 -> 12.5 W)
                power_w = round(float(raw_power) / 10.0, 1)
                # Convert tenths of V -> V (e.g. 2300 -> 230.0 V)
                voltage_v = round(float(raw_voltage) / 10.0, 1) if raw_voltage is not None else 230.0
                # Convert mA -> A (e.g. 120 -> 0.12 A)
                current_a = round(float(raw_current) / 1000.0, 2) if raw_current is not None else 0.0
                
                with live_state_lock:
                    latest_live_state = {
                        "currentLoad": power_w,
                        "voltage": voltage_v,
                        "currentAmps": current_a,
                        "status": "online",
                        "timestamp": int(time.time())
                    }
                
                consecutive_errors = 0
                # Log to terminal (optional, comment out if output is too verbose)
                # print(f" polled: {power_w}W, {voltage_v}V, {current_a}A")
            else:
                print(f"Warning: Power DPS index '{power_dps}' not found in status. Available DPS keys: {list(dps.keys())}")
                
        except Exception as e:
            consecutive_errors += 1
            print(f"Device Query Error: {e}")
            with live_state_lock:
                latest_live_state["status"] = "offline"
            
            # Close connection to force socket recreation on next poll
            try:
                device.close()
            except:
                pass
                
            # Back off sleep on consecutive errors
            time.sleep(min(poll_interval * 3, 5.0))
            continue
            
        time.sleep(poll_interval)

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
                expected = f"Bearer {api_secret}"
                if not auth_header or auth_header != expected:
                    self.send_response(401)
                    self.send_header('Content-Type', 'application/json')
                    self.send_header('Access-Control-Allow-Origin', '*')
                    self.end_headers()
                    self.wfile.write(json.dumps({"error": "Unauthorized"}).encode('utf-8'))
                    return

            self.send_response(200)
            self.send_header('Content-Type', 'application/json')
            # Enable CORS so the React app can fetch from local IP
            self.send_header('Access-Control-Allow-Origin', '*')
            self.end_headers()
            
            with live_state_lock:
                response_data = json.dumps(latest_live_state)
                
            self.wfile.write(response_data.encode('utf-8'))
        else:
            self.send_response(404)
            self.end_headers()

def run_server():
    # Start the polling worker thread
    t = threading.Thread(target=polling_worker, daemon=True)
    t.start()
    
    server_address = ('', server_port)
    httpd = ThreadingHTTPServer(server_address, LocalLiveServer)
    print(f"Server listening locally on port {server_port}...")
    print(f"Web app should fetch from: http://<tv-box-ip>:{server_port}/live")
    print("Press Ctrl+C to terminate.")
    
    try:
        httpd.serve_forever()
    except KeyboardInterrupt:
        print("\nStopping server...")
        httpd.server_close()

if __name__ == '__main__':
    run_server()
