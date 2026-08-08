package com.aethersmart.wearos.data

import android.content.Context
import androidx.datastore.preferences.core.*
import androidx.datastore.preferences.preferencesDataStore
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.map

private val Context.dataStore by preferencesDataStore(name = "aethersmart_settings")

/**
 * Mirrors react-app TuyaConfig customProxyUrl + clientSecret + region + device IDs.
 * For Dashboard-only WearOS we only need workerUrl + auth + device mapping for display names.
 * The worker resolves device IDs server-side via getConfig() — so the watch just
 * forwards whatever the user saved, same as workerService.ts buildAuthHeader logic.
 *
 * @see cloudflare-proxy/worker.js:421 getConfig()
 * @see react-app/src/utils/workerService.ts:31 buildAuthHeader()
 */
data class WearSettings(
    val workerUrl: String = "https://smart-home-api.filip013.workers.dev",
    val clientId: String = "",
    val clientSecret: String = "",
    val region: String = "eu",
    val tempDeviceId1: String = "",
    val tempDeviceId2: String = "",
    val powerDeviceId: String = "",
    val tempCode1: String = "va_temperature",
    val humCode1: String = "va_humidity",
    val tempCode2: String = "va_temperature",
    val humCode2: String = "va_humidity",
    val powerCode: String = "cur_power",
)

class SettingsRepository(private val context: Context) {

    private object Keys {
        val WORKER_URL = stringPreferencesKey("workerUrl")
        val CLIENT_ID = stringPreferencesKey("clientId")
        val CLIENT_SECRET = stringPreferencesKey("clientSecret")
        val REGION = stringPreferencesKey("region")
        val TEMP_DEVICE_ID_1 = stringPreferencesKey("tempDeviceId1")
        val TEMP_DEVICE_ID_2 = stringPreferencesKey("tempDeviceId2")
        val POWER_DEVICE_ID = stringPreferencesKey("powerDeviceId")
        val TEMP_CODE_1 = stringPreferencesKey("tempCode1")
        val HUM_CODE_1 = stringPreferencesKey("humCode1")
        val TEMP_CODE_2 = stringPreferencesKey("tempCode2")
        val HUM_CODE_2 = stringPreferencesKey("humCode2")
        val POWER_CODE = stringPreferencesKey("powerCode")
    }

    val settingsFlow: Flow<WearSettings> = context.dataStore.data.map { p ->
        WearSettings(
            workerUrl = p[Keys.WORKER_URL] ?: "",
            clientId = p[Keys.CLIENT_ID] ?: "",
            clientSecret = p[Keys.CLIENT_SECRET] ?: "",
            region = p[Keys.REGION] ?: "eu",
            tempDeviceId1 = p[Keys.TEMP_DEVICE_ID_1] ?: "",
            tempDeviceId2 = p[Keys.TEMP_DEVICE_ID_2] ?: "",
            powerDeviceId = p[Keys.POWER_DEVICE_ID] ?: "",
            tempCode1 = p[Keys.TEMP_CODE_1] ?: "va_temperature",
            humCode1 = p[Keys.HUM_CODE_1] ?: "va_humidity",
            tempCode2 = p[Keys.TEMP_CODE_2] ?: "va_temperature",
            humCode2 = p[Keys.HUM_CODE_2] ?: "va_humidity",
            powerCode = p[Keys.POWER_CODE] ?: "cur_power",
        )
    }

    suspend fun save(settings: WearSettings) {
        context.dataStore.edit { p ->
            p[Keys.WORKER_URL] = settings.workerUrl
            p[Keys.CLIENT_ID] = settings.clientId
            p[Keys.CLIENT_SECRET] = settings.clientSecret
            p[Keys.REGION] = settings.region
            p[Keys.TEMP_DEVICE_ID_1] = settings.tempDeviceId1
            p[Keys.TEMP_DEVICE_ID_2] = settings.tempDeviceId2
            p[Keys.POWER_DEVICE_ID] = settings.powerDeviceId
            p[Keys.TEMP_CODE_1] = settings.tempCode1
            p[Keys.HUM_CODE_1] = settings.humCode1
            p[Keys.TEMP_CODE_2] = settings.tempCode2
            p[Keys.HUM_CODE_2] = settings.humCode2
            p[Keys.POWER_CODE] = settings.powerCode
        }
    }

    val isConfiguredFlow: Flow<Boolean> = settingsFlow.map { s ->
        s.workerUrl.isNotBlank() && s.clientSecret.isNotBlank()
    }
}
