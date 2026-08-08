package com.aethersmart.wearos.data

import android.util.Log
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.delay
import kotlinx.coroutines.withContext
import kotlinx.serialization.Serializable
import kotlinx.serialization.json.Json
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.OkHttpClient
import okhttp3.Request
import okhttp3.RequestBody.Companion.toRequestBody
import java.util.concurrent.TimeUnit

private const val DEFAULT_WORKER_URL = "https://smart-home-api.filip013.workers.dev"

@Serializable
data class PairRegisterResponse(val success: Boolean, val code: String? = null, val expiresIn: Int? = null, val error: String? = null)

@Serializable
data class PairStatusResponse(val success: Boolean, val claimed: Boolean = false, val config: PairConfig? = null, val error: String? = null)

@Serializable
data class PairConfig(
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
    val customProxyUrl: String = DEFAULT_WORKER_URL,
)

fun PairConfig.toWearSettings(): WearSettings = WearSettings(
    workerUrl = customProxyUrl.ifBlank { DEFAULT_WORKER_URL },
    clientId = clientId,
    clientSecret = clientSecret,
    region = region,
    tempDeviceId1 = tempDeviceId1,
    tempDeviceId2 = tempDeviceId2,
    powerDeviceId = powerDeviceId,
    tempCode1 = tempCode1,
    humCode1 = humCode1,
    tempCode2 = tempCode2,
    humCode2 = humCode2,
    powerCode = powerCode,
)

class PairingRepository(
    private val okHttp: OkHttpClient = OkHttpClient.Builder()
        .connectTimeout(8, TimeUnit.SECONDS).readTimeout(8, TimeUnit.SECONDS).build(),
    private val workerUrl: String = DEFAULT_WORKER_URL,
) {
    private val json = Json { ignoreUnknownKeys = true; coerceInputValues = true }

    private fun base(): String = workerUrl.trim().trimEnd('/').ifBlank { DEFAULT_WORKER_URL }

    suspend fun register(): Result<String> = withContext(Dispatchers.IO) {
        try {
            val url = "${base()}/api/wear-pair/register"
            Log.d("AetherSmart", "Pairing register POST $url thread=${Thread.currentThread().name}")
            val req = Request.Builder()
                .url(url)
                .post("{}".toRequestBody("application/json".toMediaType()))
                .header("Accept", "application/json")
                .header("User-Agent", "AetherWear/1.0")
                .build()
            Log.d("AetherSmart", "Pairing executing OkHttp call...")
            val resp = okHttp.newCall(req).execute()
            val body = resp.body?.string() ?: ""
            Log.d("AetherSmart", "Pairing register HTTP ${resp.code} body=$body")
            if (!resp.isSuccessful) return@withContext Result.failure(Exception("HTTP ${resp.code}: $body"))
            val parsed = json.decodeFromString<PairRegisterResponse>(body)
            if (!parsed.success || parsed.code.isNullOrBlank()) return@withContext Result.failure(Exception(parsed.error ?: "Register failed"))
            Result.success(parsed.code!!)
        } catch (e: Exception) {
            Log.e("AetherSmart", "Pairing register failed: ${e::class.java.name}: ${e.message}", e)
            Log.e("AetherSmart", "Pairing cause: ${e.cause?.let { "${it::class.java.name}: ${it.message}" } ?: "none"}")
            Result.failure(Exception("${e::class.java.simpleName}: ${e.message} cause=${e.cause?.message}", e))
        }
    }

    suspend fun pollUntilClaimed(code: String, timeoutMs: Long = 300_000, intervalMs: Long = 3000): Result<PairConfig> {
        val deadline = System.currentTimeMillis() + timeoutMs
        while (System.currentTimeMillis() < deadline) {
            val r = getStatus(code)
            r.onSuccess { status ->
                if (status.claimed && status.config != null) return Result.success(status.config)
                if (!status.success) return Result.failure(Exception(status.error ?: "Status error"))
            }.onFailure { return Result.failure(it) }
            delay(intervalMs)
        }
        return Result.failure(Exception("Pairing timed out (5 min)"))
    }

    private suspend fun getStatus(code: String): Result<PairStatusResponse> = withContext(Dispatchers.IO) {
        try {
            val req = Request.Builder()
                .url("${base()}/api/wear-pair/status?code=$code")
                .get().header("Accept", "application/json").build()
            val resp = okHttp.newCall(req).execute()
            val body = resp.body?.string() ?: ""
            if (!resp.isSuccessful && resp.code != 404) return@withContext Result.failure(Exception("HTTP ${resp.code}: $body"))
            if (resp.code == 404) return@withContext Result.failure(Exception("Code expired"))
            val parsed = json.decodeFromString<PairStatusResponse>(body)
            Result.success(parsed)
        } catch (e: Exception) { Result.failure(e) }
    }
}
