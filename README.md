# AetherSmart — Smart Home Apps (monorepo)

Monorepo for the AetherSmart smart-home suite: a React + Tauri web/desktop app and supporting backend/daemon services. (The Flutter mobile app experiment is preserved on the [`flutter`](../../tree/flutter) branch).

## Layout

| Path               | What it is                                                                 |
| ------------------ | -------------------------------------------------------------------------- |
| `react-app/`       | Web app (React + TypeScript + Vite) and Tauri v2 desktop shell (`AetherSmart`) |
| `cloudflare-proxy/`| Cloudflare Worker BFF (`worker.js`) — Tuya auth, status aggregation, control, CORS proxy |
| `tuya-realtime/`   | Local Tuya real-time power monitor daemon (`daemon.py`, runs on a TV Box / Termux / home server) |
| `scripts/`         | Utility scripts (e.g. `record_history.py`, run daily via GitHub Actions)   |
| `vercel.json`      | Root Vercel config — builds and deploys `react-app/`                       |

## Apps

### react-app (web + desktop)

```bash
cd react-app
npm install
npm run dev        # vite dev server
npm run build      # type-check + production build
npm run tauri dev  # Tauri desktop shell
```

Deployed to Vercel (root `vercel.json` points the build at `react-app/`) and
distributed as a Tauri desktop app (`src-tauri/`).

### flutter-app (mobile - `flutter` branch)

The Flutter mobile application code is maintained on the [`flutter`](../../tree/flutter) branch. Switch to that branch (`git checkout flutter`) to access `flutter-app/`.

## Backend / services

- **Cloudflare Worker BFF** (`cloudflare-proxy/worker.js`): handles Tuya
  HMAC-SHA256 auth + token caching, status aggregation, device control and a
  legacy CORS proxy fallback. Deploy via the Cloudflare dashboard.
- **Tuya real-time daemon** (`tuya-realtime/daemon.py`): polls the smart power
  meter locally (TinyTuya) on a 24/7 device and serves live readings over HTTP
  (default port 8080), reachable locally or via Cloudflare Tunnel.
- **History recorder** (`scripts/record_history.py`): records daily energy and
  climate history to Firestore; scheduled daily at 01:15 UTC by
  `.github/workflows/record-history.yml`.
