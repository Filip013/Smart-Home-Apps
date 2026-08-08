package com.aethersmart.wearos.tile

import androidx.wear.protolayout.DeviceParametersBuilders
import androidx.wear.protolayout.LayoutElementBuilders
import androidx.wear.protolayout.ResourceBuilders
import androidx.wear.protolayout.TimelineBuilders
import androidx.wear.tiles.RequestBuilders
import androidx.wear.tiles.TileBuilders
import androidx.wear.tiles.TileService
import com.aethersmart.wearos.data.SettingsRepository
import com.aethersmart.wearos.data.WearSummaryApi
import com.google.common.util.concurrent.Futures
import com.google.common.util.concurrent.ListenableFuture
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.runBlocking

/**
 * Tile that shows powerWatts + 2 temps from GET /api/wear-summary.
 * @see cloudflare-proxy/worker.js:673
 */
class AetherTileService : TileService() {

    override fun onTileRequest(requestParams: RequestBuilders.TileRequest): ListenableFuture<TileBuilders.Tile> {
        // Blocking fetch is OK here — tile has 10s budget and wear-summary is ~150ms.
        // Avoids pulling kotlinx-coroutines-guava + Guava Futures complexity for v1.
        val summary = runBlocking {
            try {
                val repo = SettingsRepository(applicationContext)
                val api = WearSummaryApi()
                val settings = repo.settingsFlow.first()
                api.fetchWearSummary(settings).getOrNull()
            } catch (_: Exception) { null }
        }

        val powerText = summary?.powerWatts?.let { "${it.toInt()} W" } ?: "— W"
        val belgradeText = summary?.belgrade?.temp?.let { "%.1f°C".format(it) } ?: "—"
        val vrsacText = summary?.vrsac?.temp?.let { "%.1f°C".format(it) } ?: "—"

        val layout = LayoutElementBuilders.Layout.Builder()
            .setRoot(
                LayoutElementBuilders.Column.Builder()
                    .addContent(LayoutElementBuilders.Text.Builder().setText(powerText).build())
                    .addContent(LayoutElementBuilders.Text.Builder().setText("Belgrade $belgradeText").build())
                    .addContent(LayoutElementBuilders.Text.Builder().setText("Vrsac $vrsacText").build())
                    .addContent(LayoutElementBuilders.Text.Builder().setText("AetherSmart").build())
                    .build()
            )
            .build()

        val tile = TileBuilders.Tile.Builder()
            .setResourcesVersion("1")
            .setTileTimeline(
                TimelineBuilders.Timeline.Builder()
                    .addTimelineEntry(
                        TimelineBuilders.TimelineEntry.Builder()
                            .setLayout(layout)
                            .build()
                    )
                    .build()
            )
            .setFreshnessIntervalMillis(15 * 60 * 1000)
            .build()

        return Futures.immediateFuture(tile)
    }

    override fun onTileResourcesRequest(requestParams: RequestBuilders.ResourcesRequest): ListenableFuture<ResourceBuilders.Resources> {
        return Futures.immediateFuture(ResourceBuilders.Resources.Builder().setVersion("1").build())
    }
}
