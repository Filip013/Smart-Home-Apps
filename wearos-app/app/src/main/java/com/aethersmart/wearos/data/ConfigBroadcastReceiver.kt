package com.aethersmart.wearos.data

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.util.Log
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.launch

/**
 * ADB helper — push WearOS config without typing on the watch.
 *
 * Usage:
 *   adb shell am broadcast -a com.aethersmart.wearos.SET_CONFIG \
 *     --es workerUrl "https://smart-home-api.workers.dev" \
 *     --es clientId "yourClientId" \
 *     --es clientSecret "yourClientSecret" \
 *     --es region "eu"
 *
 * Only extras you send are updated; others keep current DataStore value.
 * This avoids editing the binary DataStore file directly.
 */
class ConfigBroadcastReceiver : BroadcastReceiver() {
    override fun onReceive(context: Context, intent: Intent) {
        if (intent.action != ACTION) return
        val pending = goAsync()
        CoroutineScope(Dispatchers.IO).launch {
            try {
                val repo = SettingsRepository(context)
                val current = repo.settingsFlow.first()
                val next = current.copy(
                    workerUrl = intent.getStringExtra("workerUrl") ?: current.workerUrl,
                    clientId = intent.getStringExtra("clientId") ?: current.clientId,
                    clientSecret = intent.getStringExtra("clientSecret") ?: current.clientSecret,
                    region = intent.getStringExtra("region") ?: current.region,
                    tempDeviceId1 = intent.getStringExtra("tempDeviceId1") ?: current.tempDeviceId1,
                    tempDeviceId2 = intent.getStringExtra("tempDeviceId2") ?: current.tempDeviceId2,
                    powerDeviceId = intent.getStringExtra("powerDeviceId") ?: current.powerDeviceId,
                )
                repo.save(next)
                Log.i("AetherSmart", "Config updated via ADB: workerUrl=${next.workerUrl}, region=${next.region}")
            } catch (e: Exception) {
                Log.e("AetherSmart", "ConfigBroadcastReceiver failed", e)
            } finally {
                pending.finish()
            }
        }
    }
    companion object { const val ACTION = "com.aethersmart.wearos.SET_CONFIG" }
}
