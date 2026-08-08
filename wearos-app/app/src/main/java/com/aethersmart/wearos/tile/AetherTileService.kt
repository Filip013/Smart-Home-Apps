package com.aethersmart.wearos.tile

import android.util.Log
import androidx.wear.protolayout.ActionBuilders
import androidx.wear.protolayout.LayoutElementBuilders
import androidx.wear.protolayout.ModifiersBuilders
import androidx.wear.protolayout.ResourceBuilders
import androidx.wear.protolayout.TimelineBuilders
import androidx.wear.tiles.RequestBuilders
import androidx.wear.tiles.TileBuilders
import androidx.wear.tiles.TileService
import com.aethersmart.wearos.data.SettingsRepository
import com.aethersmart.wearos.data.WearSummaryApi
import com.google.common.util.concurrent.Futures
import com.google.common.util.concurrent.ListenableFuture
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.launch
import kotlinx.coroutines.runBlocking

/**
 * Tile with graphics + app shortcut + live 3s×15s burst for TV-box power.
 * Tap power → live mode (3s * 5 via requestUpdate), tap bg → launch app.
 * @see cloudflare-proxy/worker.js:673 /api/wear-summary and /api/wear-live
 */
class AetherTileService : TileService() {

    private val scope = CoroutineScope(Dispatchers.IO)

    companion object {
        @Volatile var liveUntilMs: Long = 0L
        const val LIVE_DURATION_MS = 15_000L
        const val LIVE_INTERVAL_MS = 3_000L
    }

    override fun onTileRequest(requestParams: RequestBuilders.TileRequest): ListenableFuture<TileBuilders.Tile> {
        val lastId = requestParams.state?.lastClickableId ?: ""
        val now = System.currentTimeMillis()
        if (lastId == "live_power") {
            liveUntilMs = now + LIVE_DURATION_MS
            Log.d("AetherSmart", "Tile live click → liveUntil=$liveUntilMs")
        }
        val inLive = now < liveUntilMs

        data class TileData(val pw: Number?, val src: String?, val bT: Double?, val bH: Double?, val vT: Double?, val vH: Double?)
        val td = runBlocking {
            try {
                val repo = SettingsRepository(applicationContext)
                val api = WearSummaryApi()
                val s = repo.settingsFlow.first()
                if (s.clientSecret.isBlank()) return@runBlocking TileData(null, null, null, null, null, null)
                if (inLive) {
                    val live = api.fetchWearLive(s).getOrNull()
                    if (live?.powerWatts != null) {
                        val sum = api.fetchWearSummary(s).getOrNull()
                        TileData(live.powerWatts, live.source ?: "tvbox", sum?.belgrade?.temp, sum?.belgrade?.humidity, sum?.vrsac?.temp, sum?.vrsac?.humidity)
                    } else {
                        val sum = api.fetchWearSummary(s).getOrNull()
                        TileData(sum?.powerWatts as? Number, "tuya", sum?.belgrade?.temp, sum?.belgrade?.humidity, sum?.vrsac?.temp, sum?.vrsac?.humidity)
                    }
                } else {
                    val sum = api.fetchWearSummary(s).getOrNull()
                    TileData(sum?.powerWatts as? Number, null, sum?.belgrade?.temp, sum?.belgrade?.humidity, sum?.vrsac?.temp, sum?.vrsac?.humidity)
                }
            } catch (e: Exception) {
                Log.e("AetherSmart", "Tile fetch failed", e)
                TileData(null, null, null, null, null, null)
            }
        }
        val powerWatts = td.pw; val powerSource = td.src; val belgradeTemp = td.bT; val belgradeHum = td.bH; val vrsacTemp = td.vT; val vrsacHum = td.vH

        val powerText = (powerWatts as? Number)?.let { "${it.toInt()} W" } ?: "— W"
        val liveBadge = if (inLive) " • LIVE" else ""
        val belgradeLine = if (belgradeTemp != null) "Belgrade %.1f°C %d%%".format(belgradeTemp as Double, (belgradeHum as? Double)?.toInt() ?: 0) else "Belgrade —"
        val vrsacLine = if (vrsacTemp != null) "Vršac %.1f°C %d%%".format(vrsacTemp as Double, (vrsacHum as? Double)?.toInt() ?: 0) else "Vršac —"
        val sourceBadge = when (powerSource as? String) { "tvbox" -> "⚡ TV box"; "tuya" -> "☁ Tuya"; else -> "" }

        val launchClickable = ModifiersBuilders.Clickable.Builder()
            .setOnClick(ActionBuilders.LaunchAction.Builder()
                .setAndroidActivity(ActionBuilders.AndroidActivity.Builder()
                    .setPackageName("com.aethersmart.wearos")
                    .setClassName("com.aethersmart.wearos.MainActivity")
                    .build())
                .build())
            .build()
        val launchModifiers = ModifiersBuilders.Modifiers.Builder().setClickable(launchClickable).build()

        val liveClickable = ModifiersBuilders.Clickable.Builder()
            .setId("live_power")
            .setOnClick(ActionBuilders.LoadAction.Builder().build())
            .build()
        val liveModifiers = ModifiersBuilders.Modifiers.Builder().setClickable(liveClickable).build()

        // Graphics via emoji + simple boxes (ProtoLayout has no vector icons without resources — emoji is reliable on Wear OS)
        val powerColumn = LayoutElementBuilders.Column.Builder()
            .addContent(LayoutElementBuilders.Text.Builder().setText("⚡ $powerText$liveBadge").build())
            .addContent(LayoutElementBuilders.Text.Builder().setText(if (sourceBadge.isNotBlank()) sourceBadge else if (inLive) "tap again to extend" else "tap power for LIVE 15s").build())
            .build()
        val powerBox = LayoutElementBuilders.Box.Builder().setModifiers(liveModifiers).addContent(powerColumn).build()

        val rootColumn = LayoutElementBuilders.Column.Builder()
            .addContent(powerBox)
            .addContent(LayoutElementBuilders.Text.Builder().setText("🌡️ $belgradeLine").build())
            .addContent(LayoutElementBuilders.Text.Builder().setText("🌿 $vrsacLine").build())
            .addContent(LayoutElementBuilders.Text.Builder().setText("AetherSmart • tap bg for app").build())
            .build()

        val layout = LayoutElementBuilders.Layout.Builder()
            .setRoot(LayoutElementBuilders.Box.Builder().setModifiers(launchModifiers).addContent(rootColumn).build())
            .build()

        val tile = TileBuilders.Tile.Builder()
            .setResourcesVersion("1")
            .setTileTimeline(TimelineBuilders.Timeline.Builder()
                .addTimelineEntry(TimelineBuilders.TimelineEntry.Builder().setLayout(layout).build()).build())
            .setFreshnessIntervalMillis(if (inLive) LIVE_INTERVAL_MS else 15 * 60 * 1000)
            .build()

        if (inLive) {
            scope.launch {
                delay(LIVE_INTERVAL_MS)
                if (System.currentTimeMillis() < liveUntilMs) {
                    try { getUpdater(applicationContext).requestUpdate(AetherTileService::class.java) } catch (_: Exception) {}
                }
            }
        }

        return Futures.immediateFuture(tile)
    }

    override fun onTileResourcesRequest(requestParams: RequestBuilders.ResourcesRequest): ListenableFuture<ResourceBuilders.Resources> {
        return Futures.immediateFuture(ResourceBuilders.Resources.Builder().setVersion("1").build())
    }
}
