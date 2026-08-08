# AetherSmart WearOS App

Native Kotlin + Compose for Wear OS — dashboard-only v1 (read-only). Consumes the existing Cloudflare Worker `GET /api/wear-summary`.

## Why this fits your worker

* `cloudflare-proxy/worker.js:673` `GET /api/wear-summary` is already optimized for Wear OS Tiles & Complications:
  returns `{ belgrade: {temp,humidity}, vrsac: {temp,humidity}, powerWatts, timestamp }` with **3 cheap** Tuya `status` calls (no 24h history). Safe to poll every **15 min** without burning Tuya rate limits.
* Auth mirrors `react-app/src/utils/workerService.ts:31` — `Authorization: Bearer <clientSecret>` must match `?clientSecret=` query param (`worker.js:618`).

## Structure

```
wearos-app/
├── settings.gradle.kts
├── build.gradle.kts
├── gradle.properties
├── gradle/wrapper/gradle-wrapper.properties
└── app/
    ├── build.gradle.kts
    └── src/main/
        ├── AndroidManifest.xml
        └── java/com/aethersmart/wearos/
            ├── MainActivity.kt              # NavHost: dashboard ↔ settings
            ├── data/
            │   ├── SettingsRepository.kt    # DataStore (manual on-watch config)
            │   └── WearSummaryApi.kt        # OkHttp + kotlinx-serialization client for /api/wear-summary
            ├── ui/
            │   ├── Theme.kt
            │   ├── WearViewModel.kt
            │   ├── DashboardScreen.kt       # powerWatts + Belgrade/Vršac cards
            │   └── SettingsScreen.kt        # workerUrl / clientSecret / region (RemoteInput TODO)
            ├── tile/AetherTileService.kt    # PrimaryLayout tile, 15 min freshness
            └── complication/PowerComplicationService.kt  # SHORT_TEXT / LONG_TEXT / RANGED_VALUE
```

## Setup

### Prerequisites

* Android Studio Hedgehog+ with Wear OS emulator (API 30+, Wear OS 3+)
* JDK 17

### 1. Open in Android Studio

File → Open → select `wearos-app/` (not the repo root). Let Gradle sync.

If Gradle sync fails, check `gradle-wrapper.properties` distributionUrl and `app/build.gradle.kts` `compileSdk = 34`.

### 2. Configure Worker credentials

On the watch (or emulator):

1. Launch **AetherSmart** → tap **Settings** (or shows `NeedsSetup` automatically).
2. Enter:
   * **Worker URL** — e.g. `https://smart-home-api.your-name.workers.dev` (no trailing slash) — must be the same URL you set as `customProxyUrl` in react-app Settings.
   * **Client Secret** — your Tuya `clientSecret` (used as Bearer token).
   * **Region** — `eu` / `us` / `eu-west` (tap to cycle).
3. Save → Dashboard auto-refreshes via `GET /api/wear-summary?clientId=...&clientSecret=...&region=...`.

> Tip: Device IDs and DP codes default to empty — the worker falls back to `env`/`KV` (`worker.js:421 getConfig()`). To override per-watch, extend `SettingsScreen.kt` / `SettingsRepository.kt` (fields already exist: `tempDeviceId1`, `powerDeviceId`, etc.).

**ADB shortcut for emulator** (avoids typing on tiny screen):

```bash
# Example — replace with real values
adb -s emulator-5554 shell am broadcast -a com.aethersmart.wearos.SET_CONFIG \
  --es workerUrl "https://smart-home-api.your-name.workers.dev" \
  --es clientSecret "your_tuya_client_secret" \
  --es region "eu"
# Then force DataStore write via a debug button, or temporarily hardcode in SettingsRepository.
```

Better for dev: hardcode defaults in `SettingsRepository.kt` or `SettingsScreen.kt` quick-fill button, then remove before release.

### 3. Run

* Select **Wear OS emulator** → Run `app`.
* Add Tile: long-press watch face → Tiles → add **AetherSmart**.
* Add Complication: long-press watch face → Customize → pick **AetherSmart Power** for SHORT_TEXT / RANGED_VALUE slot.

## Tile & Complication details

* **Tile** (`AetherTileService`): `PrimaryLayout` with power title + 2 city rows. `setFreshnessIntervalMillis(15*60*1000)`. No WorkManager needed — system re-requests on interval + on tile visible.
* **Complication** (`PowerComplicationService`): update period `900s` in manifest (`UPDATE_PERIOD_SECONDS`). Shows `1.2 kW` / `1240 W`, long text with Belgrade temp, or ranged gauge 0–5000W. `NoDataComplicationData` if not configured.

## Next steps (when you want more)

* **RemoteInput**: wire `androidx.wear.input.RemoteInput` intents in `SettingsScreen` so you can type Worker URL on-watch via voice/keyboard. Search `TODO: RemoteInput` in `SettingsScreen.kt`.
* **Tap action**: add `PendingIntent` to complication/tile to launch `MainActivity` (see `setTapAction` TODO in `PowerComplicationService.kt`).
* **Controls** (v2): add `POST /api/control` button for a Tuya switch — reuse same `Authorization` header, payload `{ deviceId, commands }`.
* **Phone sync** (alternative to manual): replace DataStore with `DataClient` (`play-services-wearable`) and sync `tuya_config` from `react-app`.

## Troubleshooting

* `401 Unauthorized` — `clientSecret` mismatch: ensure watch `Authorization: Bearer <secret>` equals `?clientSecret=` value (worker checks `worker.js:618`). Same bug as phone if secrets diverge.
* Tile shows `—` — worker returned null temps (device offline) or `powerWatts === null`. Check `GET /api/wear-summary` in browser with same query params.
* Emulator has no internet — check `android.permission.INTERNET` is in manifest and emulator has network.
