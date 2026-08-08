package com.aethersmart.wearos.data

import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import kotlinx.serialization.Serializable
import kotlinx.serialization.json.Json
import okhttp3.OkHttpClient
import okhttp3.Request
import java.util.concurrent.TimeUnit

/**
 * Client for GET /api/wear-summary — ultra-lightweight payload optimized for
 * Wear OS Tiles & Complications.
 *
 * @see cloudflare-proxy/worker.js:673 GET /api/wear-summary
 *
 * Response shape:
 * {
 *   success: true,
 *   timestamp: 1710000000,
 *   belgrade: { temp: 22.4, humidity: 45 },
 *   vrsac: { temp: 18.1, humidity: 62 },
 *   powerWatts: 1240
 * }
 */
@Serializable
data class WearSummaryResponse(
    val success: Boolean,
    val timestamp: Long? = null,
    val belgrade: SensorReading? = null,
    val vrsac: SensorReading? = null,
    // Keep raw so nullable fields don't crash deserialization
    val powerWatts: Double? = null,
    val error: String? = null
)

@Serializable
data class SensorReading(
    val temp: Double? = null,
    val humidity: Double? = null
)

@Serializable
data class WearLiveResponse(
    val success: Boolean,
    val timestamp: Long? = null,
    val source: String? = null,
    val powerWatts: Double? = null,
    val voltage: Double? = null,
    val currentAmps: Double? = null,
    val error: String? = null
)

// ── Full status (/api/status) — current values + 24h history for detail screens ──
@Serializable
data class WearStatusResponse(
    val success: Boolean,
    val timestamp: Long? = null,
    val sensors: List<WearSensor> = emptyList(),
    val power: WearPower? = null,
    val error: String? = null
)

@Serializable
data class WearSensor(
    val id: String? = null,
    val name: String? = null,
    val location: String? = null,
    val currentTemp: Double? = null,
    val currentHumidity: Double? = null,
    val status: String? = null,
    val battery: Double? = null,
    val history: List<WearHour> = emptyList()
)

@Serializable
data class WearHour(
    val time: String? = null,
    val temp: Double? = null,
    val humidity: Double? = null
)

@Serializable
data class WearPower(
    val id: String? = null,
    val name: String? = null,
    val currentLoad: Double? = null,
    val voltage: Double? = null,
    val currentAmps: Double? = null,
    val todayKwh: Double? = null,
    val hourlyHistory: List<WearPowerHour> = emptyList()
)

@Serializable
data class WearPowerHour(
    val time: String? = null,
    val loadWatts: Double? = null,
    val voltage: Double? = null,
    val currentAmps: Double? = null
)

class WearSummaryApi(
    private val okHttp: OkHttpClient = OkHttpClient.Builder()
        .connectTimeout(6, TimeUnit.SECONDS)
        .readTimeout(6, TimeUnit.SECONDS)
        .build()
) {
    private val json = Json { ignoreUnknownKeys = true; coerceInputValues = true }

    /**
     * Mirrors react-app/src/utils/workerService.ts auth: Authorization: Bearer <clientSecret>
     * must match ?clientSecret= query param for worker auth gate.
     *
     * @see cloudflare-proxy/worker.js:618
     */
    suspend fun fetchWearSummary(settings: WearSettings): Result<WearSummaryResponse> = withContext(Dispatchers.IO) {
        try {
            val base = settings.workerUrl.trim().trimEnd('/')
            if (base.isBlank()) return@withContext Result.failure(IllegalArgumentException("Worker URL not configured"))

            // Build query exactly like getConfig() expects — same param names as workerService.ts
            val url = buildString {
                append(base)
                append("/api/wear-summary?")
                append("clientId=").append(encode(settings.clientId))
                append("&clientSecret=").append(encode(settings.clientSecret))
                append("&region=").append(encode(settings.region))
                if (settings.tempDeviceId1.isNotBlank()) append("&tempDeviceId1=").append(encode(settings.tempDeviceId1))
                if (settings.tempDeviceId2.isNotBlank()) append("&tempDeviceId2=").append(encode(settings.tempDeviceId2))
                if (settings.powerDeviceId.isNotBlank()) append("&powerDeviceId=").append(encode(settings.powerDeviceId))
                append("&tempCode1=").append(encode(settings.tempCode1))
                append("&humCode1=").append(encode(settings.humCode1))
                append("&tempCode2=").append(encode(settings.tempCode2))
                append("&humCode2=").append(encode(settings.humCode2))
                append("&powerCode=").append(encode(settings.powerCode))
            }

            val authHeader = if (settings.clientSecret.startsWith("Bearer ")) settings.clientSecret else "Bearer ${settings.clientSecret}"

            val req = Request.Builder()
                .url(url)
                .get()
                .header("Accept", "application/json")
                .header("Authorization", authHeader)
                .build()

            val resp = okHttp.newCall(req).execute()
            val body = resp.body?.string() ?: ""
            if (!resp.isSuccessful) {
                return@withContext Result.failure(Exception("HTTP ${resp.code}: $body"))
            }
            val parsed = json.decodeFromString<WearSummaryResponse>(body)
            if (!parsed.success) {
                return@withContext Result.failure(Exception(parsed.error ?: "Unknown worker error"))
            }
            return@withContext Result.success(parsed)
        } catch (e: Exception) {
            return@withContext Result.failure(e)
        }
    }

    suspend fun fetchWearStatus(settings: WearSettings): Result<WearStatusResponse> = withContext(Dispatchers.IO) {
        try {
            val base = settings.workerUrl.trim().trimEnd('/').ifBlank { return@withContext Result.failure(IllegalArgumentException("Worker URL not configured")) }
            val url = buildString {
                append(base); append("/api/status?")
                append("clientId=").append(encode(settings.clientId))
                append("&clientSecret=").append(encode(settings.clientSecret))
                append("&region=").append(encode(settings.region))
                if (settings.tempDeviceId1.isNotBlank()) append("&tempDeviceId1=").append(encode(settings.tempDeviceId1))
                if (settings.tempDeviceId2.isNotBlank()) append("&tempDeviceId2=").append(encode(settings.tempDeviceId2))
                if (settings.powerDeviceId.isNotBlank()) append("&powerDeviceId=").append(encode(settings.powerDeviceId))
                append("&tempCode1=").append(encode(settings.tempCode1))
                append("&humCode1=").append(encode(settings.humCode1))
                append("&tempCode2=").append(encode(settings.tempCode2))
                append("&humCode2=").append(encode(settings.humCode2))
                append("&powerCode=").append(encode(settings.powerCode))
            }
            val authHeader = if (settings.clientSecret.startsWith("Bearer ")) settings.clientSecret else "Bearer ${settings.clientSecret}"
            val req = Request.Builder().url(url).get().header("Accept", "application/json").header("Authorization", authHeader).build()
            val resp = okHttp.newCall(req).execute()
            val body = resp.body?.string() ?: ""
            if (!resp.isSuccessful) return@withContext Result.failure(Exception("HTTP ${resp.code}: $body"))
            val parsed = json.decodeFromString<WearStatusResponse>(body)
            if (!parsed.success) return@withContext Result.failure(Exception(parsed.error ?: "Unknown"))
            return@withContext Result.success(parsed)
        } catch (e: Exception) { return@withContext Result.failure(e) }
    }

    suspend fun fetchWearLive(settings: WearSettings): Result<WearLiveResponse> = withContext(Dispatchers.IO) {
        try {
            val base = settings.workerUrl.trim().trimEnd('/').ifBlank { return@withContext Result.failure(IllegalArgumentException("Worker URL not configured")) }
            val url = buildString {
                append(base); append("/api/wear-live?")
                append("clientId=").append(encode(settings.clientId))
                append("&clientSecret=").append(encode(settings.clientSecret))
                append("&region=").append(encode(settings.region))
                if (settings.powerDeviceId.isNotBlank()) append("&powerDeviceId=").append(encode(settings.powerDeviceId))
                if (settings.powerCode.isNotBlank()) append("&powerCode=").append(encode(settings.powerCode))
            }
            val authHeader = if (settings.clientSecret.startsWith("Bearer ")) settings.clientSecret else "Bearer ${settings.clientSecret}"
            val req = Request.Builder().url(url).get().header("Accept", "application/json").header("Authorization", authHeader).build()
            val resp = okHttp.newCall(req).execute()
            val body = resp.body?.string() ?: ""
            if (!resp.isSuccessful) return@withContext Result.failure(Exception("HTTP ${resp.code}: $body"))
            val parsed = json.decodeFromString<WearLiveResponse>(body)
            if (!parsed.success) return@withContext Result.failure(Exception(parsed.error ?: "Unknown"))
            return@withContext Result.success(parsed)
        } catch (e: Exception) { return@withContext Result.failure(e) }
    }

    private fun encode(v: String): String = java.net.URLEncoder.encode(v, "UTF-8")
}
