# ADB — WearOS Emulator & Physical Watch

## 1. Find device

```powershell
adb devices
# emulator-5554   device  <- Wear OS emulator
# 192.168.1.23:5555 device  <- physical watch (after adb connect / wireless debugging)
```

If physical watch: enable Developer Options → ADB debugging + Wireless debugging → `adb pair <ip>:<pairPort> <code>` then `adb connect <ip>:<port>`.

## 2. Build & install

From `wearos-app/` in Android Studio: Run `app` once, or via CLI:

```powershell
# from wearos-app/
.\gradlew :app:installDebug        # needs local.properties with sdk.dir
# or manually:
adb -s emulator-5554 install -r app\build\outputs\apk\debug\app-debug.apk
```

Launch:

```powershell
adb -s emulator-5554 shell am start -n com.aethersmart.wearos/.MainActivity
```

## 3. Push config without typing on watch (NEW)

No need to type Worker URL on the tiny screen. This uses `ConfigBroadcastReceiver` (`data/ConfigBroadcastReceiver.kt:14`):

```powershell
# Minimal — only workerUrl + secret + region required (others fall back to worker env/KV)
adb -s emulator-5554 shell am broadcast -a com.aethersmart.wearos.SET_CONFIG `
  --es workerUrl "https://smart-home-api.your-name.workers.dev" `
  --es clientId "your_tuya_client_id" `
  --es clientSecret "your_tuya_client_secret" `
  --es region "eu"

# With explicit device IDs (optional — if omitted, worker uses env/KV from getConfig())
adb -s emulator-5554 shell am broadcast -a com.aethersmart.wearos.SET_CONFIG `
  --es workerUrl "https://smart-home-api.your-name.workers.dev" `
  --es clientId "..." --es clientSecret "..." --es region "eu" `
  --es tempDeviceId1 "..." --es tempDeviceId2 "..." --es powerDeviceId "..."

# Verify it was saved (logcat)
adb -s emulator-5554 logcat -s AetherSmart | Select-String "Config updated"
```

Re-open the app — Dashboard should show `powerWatts` + temps immediately. No reboot needed.

## 4. Verify worker without watch

Same auth as `workerService.ts:31` / `worker.js:618`:

```powershell
$workerUrl = "https://smart-home-api.your-name.workers.dev"
$secret = "your_tuya_client_secret"
$clientId = "your_tuya_client_id"
$url = "$workerUrl/api/wear-summary?clientId=$clientId&clientSecret=$secret&region=eu"
Invoke-RestMethod -Headers @{ Authorization = "Bearer $secret" } -Uri $url | ConvertTo-Json -Depth 4
# expect: { success:true, belgrade:{temp:22.4,humidity:45}, vrsac:{...}, powerWatts:1240 }
```

If that returns 401, your `clientSecret` mismatch — check `?clientSecret=` vs `Authorization` header.

## 5. Useful ADB

```powershell
adb -s emulator-5554 logcat -s AetherSmart         # app logs (WearSummaryApi, DataStore)
adb -s emulator-5554 shell dumpsys activity top    # check MainActivity
adb -s emulator-5554 shell pm clear com.aethersmart.wearos  # wipe DataStore (re-enter config)
adb -s emulator-5554 shell input text "hello"       # type into focused field (alternative to broadcast)
```
