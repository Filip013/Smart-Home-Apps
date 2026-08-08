package com.aethersmart.wearos.complication

import androidx.wear.watchface.complications.data.*
import androidx.wear.watchface.complications.datasource.ComplicationRequest
import androidx.wear.watchface.complications.datasource.SuspendingComplicationDataSourceService
import com.aethersmart.wearos.data.SettingsRepository
import com.aethersmart.wearos.data.WearSummaryApi
import kotlinx.coroutines.flow.first

/**
 * Complication showing live powerWatts.
 * Supports SHORT_TEXT (e.g. "1.2 kW" on watch face), LONG_TEXT, and RANGED_VALUE.
 * Update period is 900s (15 min) per manifest — same reasoning as Tile: avoid Tuya rate limits.
 */
class PowerComplicationService : SuspendingComplicationDataSourceService() {

    override suspend fun onComplicationRequest(request: ComplicationRequest): ComplicationData? {
        val repo = SettingsRepository(this)
        val api = WearSummaryApi()
        val settings = repo.settingsFlow.first()
        if (settings.workerUrl.isBlank() || settings.clientSecret.isBlank()) {
            return NoDataComplicationData()
        }
        val summary = api.fetchWearSummary(settings).getOrNull() ?: return NoDataComplicationData()
        val watts = summary.powerWatts ?: return NoDataComplicationData()
        val kw = watts / 1000.0

        return when (request.complicationType) {
            ComplicationType.SHORT_TEXT -> ShortTextComplicationData.Builder(
                text = PlainComplicationText.Builder(if (watts >= 1000) "%.1f kW".format(kw) else "${watts.toInt()} W").build(),
                contentDescription = PlainComplicationText.Builder("Power ${watts.toInt()} watts").build()
            )
                .setTitle(PlainComplicationText.Builder("Aether").build())
                .setTapAction(null) // TODO: launch MainActivity via PendingIntent
                .build()

            ComplicationType.LONG_TEXT -> LongTextComplicationData.Builder(
                text = PlainComplicationText.Builder("⚡ ${watts.toInt()} W — Belgrade ${summary.belgrade?.temp?.let { "%.1f°C".format(it) } ?: "—"}").build(),
                contentDescription = PlainComplicationText.Builder("Power and temperature").build()
            )
                .setTitle(PlainComplicationText.Builder("AetherSmart").build())
                .build()

            ComplicationType.RANGED_VALUE -> {
                // 0..5000W range — adjust to your peak
                val maxWatts = 5000f
                RangedValueComplicationData.Builder(
                    value = watts.toFloat().coerceIn(0f, maxWatts),
                    min = 0f,
                    max = maxWatts,
                    contentDescription = PlainComplicationText.Builder("${watts.toInt()} watts").build()
                )
                    .setText(PlainComplicationText.Builder("${watts.toInt()} W").build())
                    .setTitle(PlainComplicationText.Builder("Power").build())
                    .build()
            }
            else -> null
        }
    }

    override fun getPreviewData(type: ComplicationType): ComplicationData? {
        return when (type) {
            ComplicationType.SHORT_TEXT -> ShortTextComplicationData.Builder(
                text = PlainComplicationText.Builder("1.2 kW").build(),
                contentDescription = PlainComplicationText.Builder("Preview").build()
            ).setTitle(PlainComplicationText.Builder("Aether").build()).build()
            ComplicationType.LONG_TEXT -> LongTextComplicationData.Builder(
                text = PlainComplicationText.Builder("⚡ 1240 W — Belgrade 22.4°C").build(),
                contentDescription = PlainComplicationText.Builder("Preview").build()
            ).setTitle(PlainComplicationText.Builder("AetherSmart").build()).build()
            ComplicationType.RANGED_VALUE -> RangedValueComplicationData.Builder(
                value = 1240f, min = 0f, max = 5000f,
                contentDescription = PlainComplicationText.Builder("1240 W").build()
            ).setText(PlainComplicationText.Builder("1240 W").build()).build()
            else -> null
        }
    }
}
