# Local Tuya Real-Time Power Monitor Daemon (Termux / TV Box)

This server daemon script runs on a 24/7 device (like a TV Box inside Termux, a Raspberry Pi, or a home server connected to your local network) to poll your Tuya smart power meter **locally** using TinyTuya. 

It starts a lightweight local HTTP server that exposes the live readings on a port (default: `8080`). Your browser-side web application can then fetch these readings directly on your local network or remotely over the internet via a Cloudflare Tunnel!

---

## Setup Instructions

### 1. Install System Dependencies (Termux)
Open Termux on your TV box and install Python 3:
```bash
pkg update && pkg upgrade
pkg install python python-pip
```

### 2. Install TinyTuya Library
TinyTuya handles local protocol communication with Tuya smart devices:
```bash
pip install tinytuya
```

### 3. Retrieve your Local Key and Device IP
TinyTuya requires a cryptographic `local_key` to decrypt local device communication. You can extract it automatically using TinyTuya's helper wizard:
1. Run the wizard command in your terminal:
   ```bash
   python -m tinytuya wizard
   ```
2. Follow the prompt to log in with your Tuya IoT Developer credentials.
3. The wizard will automatically query the cloud, scan your local network, find your devices, and output a `devices.json` file containing their **IP addresses** and **local keys**.

### 4. Create `config.json`
Sync this `tuya-realtime` folder to your TV box and create a `config.json` file in it:
```json
{
  "device_id": "bf8b40...",
  "local_key": "YOUR_DEVICE_LOCAL_KEY",
  "device_ip": "192.168.1.123",
  "protocol_version": "3.3",
  "power_dps_index": "19",
  "voltage_dps_index": "20",
  "current_dps_index": "18",
  "server_port": 8080,
  "poll_interval_seconds": 1.5
}
```
> **Note**: For most Tuya power meters/smart plugs, the standard DPS mapping is:
> - `19` = Active Power (Watts)
> - `20` = Voltage (Volts)
> - `18` = Current (Amps)

---

## Running the Daemon

### Verification Run
Run the script in the foreground to test the local socket connection and HTTP server:
```bash
python daemon.py
```
Outputs:
```text
Initializing TinyTuya for Device bf8b40... at 192.168.1.123
Started background local polling thread...
Server listening locally on port 8080...
Web app should fetch from: http://<tv-box-ip>:8080/live
Press Ctrl+C to terminate.
```

### 24/7 Background Run (Termux)
To keep the server listening after you close Termux, start it in the background using `nohup`:
```bash
nohup python daemon.py > daemon.log 2>&1 &
```
You can view the logs or check for errors:
```bash
tail -f daemon.log
```
To stop the daemon:
```bash
kill $(pgrep -f daemon.py)
```

---

## Accessing the Data Remotely (Cloudflare Tunnel)

To access your TV box's local server from the internet (e.g. when you are away from home and on mobile data), you can run a free **Cloudflare Tunnel** directly in Termux. This exposes your local server securely without requiring any router port-forwarding or public IP setups.

### Option A: Free Quick Tunnel (Zero Config)
1. Install `cloudflared` (Cloudflare Tunnel client) in Termux:
   - On most TV boxes (ARM64 architecture), run:
     ```bash
     pkg install cloudflared
     ```
     *(If `pkg` doesn't have it, download the ARM64 binary directly from the Cloudflare releases page).*
2. Start the tunnel:
   ```bash
   cloudflared tunnel --url http://localhost:8080
   ```
3. Cloudflare will output a public HTTPS URL like:
   `https://some-random-words.trycloudflare.com`
4. Copy this URL and paste it into the **Local TV Box IP Address** field in the Web App's **Settings** tab.
5. Keep it running in the background using `nohup`:
   ```bash
   nohup cloudflared tunnel --url http://localhost:8080 > tunnel.log 2>&1 &
   ```

### Option B: Persistent Named Tunnel (Recommended)
If you own a domain connected to Cloudflare, you can create a permanent tunnel that maps to a custom subdomain (e.g., `https://power.yourdomain.com`):
1. Authenticate `cloudflared` with your Cloudflare account:
   ```bash
   cloudflared tunnel login
   ```
2. Create the tunnel:
   ```bash
   cloudflared tunnel create tuya-tunnel
   ```
3. Route a subdomain to the tunnel:
   ```bash
   cloudflared tunnel route dns tuya-tunnel power.yourdomain.com
   ```
4. Create a config file `~/.cloudflared/config.yml`:
   ```yaml
   tunnel: <TUNNEL_UUID>
   credentials-file: /data/data/com.termux/files/home/.cloudflared/<TUNNEL_UUID>.json
   
   ingress:
     - hostname: power.yourdomain.com
       service: http://localhost:8080
     - service: http_status:404
   ```
5. Run the tunnel daemon:
   ```bash
   cloudflared tunnel run tuya-tunnel
   ```
6. Put `https://power.yourdomain.com` in your web app Settings!
