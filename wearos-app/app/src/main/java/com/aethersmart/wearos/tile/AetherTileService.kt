package com.aethersmart.wearos.tile

import android.util.Log
import androidx.wear.protolayout.ActionBuilders
import androidx.wear.protolayout.ColorBuilders
import androidx.wear.protolayout.DimensionBuilders
import androidx.wear.protolayout.LayoutElementBuilders
import androidx.wear.protolayout.ModifiersBuilders
import androidx.wear.protolayout.ResourceBuilders
import androidx.wear.protolayout.TimelineBuilders
import androidx.wear.protolayout.material.CircularProgressIndicator
import androidx.wear.protolayout.material.ProgressIndicatorColors
import androidx.wear.tiles.RequestBuilders
import androidx.wear.tiles.TileBuilders
import androidx.wear.tiles.TileService
import com.aethersmart.wearos.R
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
 * Polished tile: header + power ring + dual temp cards + live 3s×15s burst + app shortcut.
 *
 * Colors follow the AetherSmart palette:
 *   indigo #818CF8, emerald #34D399, amber #F59E0B, sky #38BDF8,
 *   cards #151922, track #232A36, text #F8FAFC / #94A3B8.
 */
class AetherTileService : TileService() {

    private val scope = CoroutineScope(Dispatchers.IO)

    companion object {
        @Volatile var liveUntilMs: Long = 0L
        const val LIVE_DURATION_MS = 15_000L
        const val LIVE_INTERVAL_MS = 3_000L
        const val MAX_POWER_W = 5000f
    }

    // ─── colors ───
    private fun color(argb: Long) = ColorBuilders.ColorProp.Builder().setArgb(argb.toInt()).build()
    private val C_TEXT   = color(0xFFF8FAFC)
    private val C_MUTED  = color(0xFF94A3B8)
    private val C_INDIGO = color(0xFF818CF8)
    private val C_EMERALD= color(0xFF34D399)
    private val C_AMBER  = color(0xFFF59E0B)
    private val C_SKY    = color(0xFF38BDF8)
    private val C_CARD   = color(0xFF151922)
    private val C_TRACK  = color(0xFF232A36)
    private val C_RED    = color(0xFFF87171)
    private val C_BG     = color(0xFF0A0D14)

    private fun dp(v: Float) = DimensionBuilders.DpProp.Builder().setValue(v).build()

    override fun onTileRequest(requestParams: RequestBuilders.TileRequest): ListenableFuture<TileBuilders.Tile> {
        val lastId = requestParams.state?.lastClickableId ?: ""
        val now = System.currentTimeMillis()
        if (lastId == "live_power") { liveUntilMs = now + LIVE_DURATION_MS }
        val inLive = now < liveUntilMs

        data class D(val w: Number?, val src: String?, val bT: Double?, val bH: Double?, val vT: Double?, val vH: Double?)
        val d = runBlocking {
            try {
                val repo = SettingsRepository(applicationContext); val api = WearSummaryApi()
                val s = repo.settingsFlow.first()
                if (s.clientSecret.isBlank()) D(null, null, null, null, null, null)
                else if (inLive) {
                    val live = api.fetchWearLive(s).getOrNull()
                    if (live?.powerWatts != null) {
                        val sum = api.fetchWearSummary(s).getOrNull()
                        D(live.powerWatts, live.source ?: "tvbox", sum?.belgrade?.temp, sum?.belgrade?.humidity, sum?.vrsac?.temp, sum?.vrsac?.humidity)
                    } else { val sum = api.fetchWearSummary(s).getOrNull(); D(sum?.powerWatts, "tuya", sum?.belgrade?.temp, sum?.belgrade?.humidity, sum?.vrsac?.temp, sum?.vrsac?.humidity) }
                } else { val sum = api.fetchWearSummary(s).getOrNull(); D(sum?.powerWatts, null, sum?.belgrade?.temp, sum?.belgrade?.humidity, sum?.vrsac?.temp, sum?.vrsac?.humidity) }
            } catch (e: Exception) { Log.e("AetherSmart", "Tile fetch failed", e); D(null, null, null, null, null, null) }
        }

        val watts = (d.w as? Number)?.toFloat() ?: 0f
        val powerStr = if (d.w != null) "${watts.toInt()}" else "—"
        val source = d.src
        val progress = (watts / MAX_POWER_W).coerceIn(0f, 1f)

        // Header
        val headerLeft = LayoutElementBuilders.Row.Builder()
            .setVerticalAlignment(LayoutElementBuilders.VERTICAL_ALIGN_CENTER)
            .addContent(
                LayoutElementBuilders.Image.Builder()
                    .setResourceId("ic_zap")
                    .setWidth(dp(18f)).setHeight(dp(18f))
                    .setColorFilter(LayoutElementBuilders.ColorFilter.Builder().setTint(C_INDIGO).build())
                    .build()
            )
            .addContent(
                LayoutElementBuilders.Spacer.Builder().setWidth(dp(6f)).build()
            )
            .addContent(
                LayoutElementBuilders.Column.Builder()
                    .addContent(text("AetherSmart", 13f, C_TEXT, bold = true, lines = 1))
                    .addContent(text("Smart home glance", 9f, C_MUTED, lines = 1))
                    .build()
            )
            .build()

        val livePill = if (inLive)
            LayoutElementBuilders.Box.Builder()
                .setModifiers(
                    ModifiersBuilders.Modifiers.Builder()
                        .setBackground(
                            ModifiersBuilders.Background.Builder()
                                .setColor(C_AMBER)
                                .setCorner(ModifiersBuilders.Corner.Builder().setRadius(dp(9f)).build())
                                .build()
                        )
                        .setPadding(ModifiersBuilders.Padding.Builder().setStart(dp(8f)).setEnd(dp(8f)).setTop(dp(4f)).setBottom(dp(4f)).build())
                        .build()
                )
                .addContent(text("LIVE", 9f, color(0xFF1A1A1A), bold = true, lines = 1))
                .build()
            else null

        val headerBuilder = LayoutElementBuilders.Row.Builder()
            .setVerticalAlignment(LayoutElementBuilders.VERTICAL_ALIGN_CENTER)
            .setWidth(DimensionBuilders.ExpandedDimensionProp.Builder().build())
            .addContent(headerLeft)
            .addContent(LayoutElementBuilders.Spacer.Builder().setWidth(DimensionBuilders.ExpandedDimensionProp.Builder().build()).build())
        if (livePill != null) headerBuilder.addContent(livePill)
        val header = headerBuilder.build()

        // Power ring
        val sourceColor = when (source) { "tvbox" -> C_SKY; "tuya" -> C_AMBER; else -> C_MUTED }
        val sourceLabel = when (source) { "tvbox" -> "TV box live"; "tuya" -> "Cloud"; else -> "Power" }

        val ringInner = LayoutElementBuilders.Column.Builder()
            .setWidth(DimensionBuilders.ExpandedDimensionProp.Builder().build())
            .setHorizontalAlignment(LayoutElementBuilders.HORIZONTAL_ALIGN_CENTER)
            .addContent(
                LayoutElementBuilders.Text.Builder().setText(if (inLive) powerStr else if (d.w != null) powerStr else "—").setFontStyle(font(30f, C_TEXT, bold = true)).setMaxLines(1).build()
            )
            .addContent(text(if (inLive) "W · LIVE" else "WATTS", 9f, if (inLive) C_AMBER else C_INDIGO, bold = true, lines = 1, ls = 0.18f))
            .addContent(
                LayoutElementBuilders.Spacer.Builder().setHeight(dp(2f)).build()
            )
            .addContent(text(sourceLabel, 10f, sourceColor, lines = 1))
            .build()

        val ringBox = LayoutElementBuilders.Box.Builder()
            .setWidth(dp(148f)).setHeight(dp(148f))
            .setModifiers(ModifiersBuilders.Modifiers.Builder().setClickable(liveClickable("live_power")).build())
            .addContent(
                CircularProgressIndicator.Builder()
                    .setProgress(progress)
                    .setStartAngle(0f).setEndAngle(300f)
                    .setStrokeWidth(10f)
                    .setCircularProgressIndicatorColors(ProgressIndicatorColors(C_INDIGO, C_TRACK))
                    .setContentDescription("Power load $powerStr watts")
                    .build()
            )
            .addContent(ringInner)
            .build()

        // Temp cards
        val bgCard = ModifiersBuilders.Background.Builder().setColor(C_CARD).setCorner(ModifiersBuilders.Corner.Builder().setRadius(dp(14f)).build()).build()
        val cardPadding = ModifiersBuilders.Padding.Builder().setAll(dp(10f)).build()

        fun tempCard(label: String, temp: Double?, hum: Double?, icon: String, iconColor: ColorBuilders.ColorProp, tempColor: ColorBuilders.ColorProp): LayoutElementBuilders.Box {
            val tempStr = temp?.let { "%.1f°C".format(it) } ?: "—"
            val humStr = hum?.let { "${it.toInt()}%" } ?: "—"
            return LayoutElementBuilders.Box.Builder()
                .setWidth(dp(104f))
                .setModifiers(ModifiersBuilders.Modifiers.Builder().setBackground(bgCard).setPadding(cardPadding).build())
                .addContent(
                    LayoutElementBuilders.Column.Builder()
                        .addContent(
                            LayoutElementBuilders.Row.Builder()
                                .setVerticalAlignment(LayoutElementBuilders.VERTICAL_ALIGN_CENTER)
                                .addContent(
                                    LayoutElementBuilders.Image.Builder()
                                        .setResourceId(icon).setWidth(dp(12f)).setHeight(dp(12f))
                                        .setColorFilter(LayoutElementBuilders.ColorFilter.Builder().setTint(iconColor).build())
                                        .build()
                                )
                                .addContent(LayoutElementBuilders.Spacer.Builder().setWidth(dp(4f)).build())
                                .addContent(text(label, 10f, C_MUTED, lines = 1, maxLines = 1))
                                .build()
                        )
                        .addContent(LayoutElementBuilders.Spacer.Builder().setHeight(dp(4f)).build())
                        .addContent(text(tempStr, 17f, tempColor, bold = true, lines = 1))
                        .addContent(LayoutElementBuilders.Spacer.Builder().setHeight(dp(3f)).build())
                        .addContent(
                            LayoutElementBuilders.Row.Builder()
                                .setVerticalAlignment(LayoutElementBuilders.VERTICAL_ALIGN_CENTER)
                                .addContent(
                                    LayoutElementBuilders.Image.Builder()
                                        .setResourceId("ic_droplet").setWidth(dp(11f)).setHeight(dp(11f))
                                        .setColorFilter(LayoutElementBuilders.ColorFilter.Builder().setTint(C_EMERALD).build())
                                        .build()
                                )
                                .addContent(LayoutElementBuilders.Spacer.Builder().setWidth(dp(4f)).build())
                                .addContent(text(humStr, 11f, C_MUTED, lines = 1))
                                .build()
                        )
                        .build()
                )
                .build()
        }

        val cardRow = LayoutElementBuilders.Row.Builder()
            .setVerticalAlignment(LayoutElementBuilders.VERTICAL_ALIGN_TOP)
            .setWidth(DimensionBuilders.ExpandedDimensionProp.Builder().build())
            .addContent(tempCard("Belgrade", d.bT, d.bH, "ic_thermometer", C_RED, C_TEXT))
            .addContent(LayoutElementBuilders.Spacer.Builder().setWidth(DimensionBuilders.ExpandedDimensionProp.Builder().build()).build())
            .addContent(tempCard("Vršac", d.vT, d.vH, "ic_leaf", C_EMERALD, C_EMERALD))
            .build()

        // Footer hint
        val hint = text(if (inLive) "LIVE · tap ring to extend" else "tap ring = LIVE 15s · bg = app", 9f, C_MUTED, lines = 1)

        val rootColumn = LayoutElementBuilders.Column.Builder()
            .setWidth(DimensionBuilders.ExpandedDimensionProp.Builder().build())
            .addContent(header)
            .addContent(LayoutElementBuilders.Spacer.Builder().setHeight(dp(12f)).build())
            .addContent(ringBox)
            .addContent(LayoutElementBuilders.Spacer.Builder().setHeight(dp(10f)).build())
            .addContent(cardRow)
            .addContent(LayoutElementBuilders.Spacer.Builder().setHeight(dp(8f)).build())
            .addContent(hint)
            .build()

        // Root: full-screen click → app (clickable wraps column)
        val root = LayoutElementBuilders.Box.Builder()
            .setWidth(DimensionBuilders.ExpandedDimensionProp.Builder().build())
            .setHeight(DimensionBuilders.ExpandedDimensionProp.Builder().build())
            .setModifiers(
                ModifiersBuilders.Modifiers.Builder()
                    .setBackground(ModifiersBuilders.Background.Builder().setColor(C_BG).build())
                    .setPadding(ModifiersBuilders.Padding.Builder().setAll(dp(8f)).build())
                    .setClickable(launchClickable())
                    .build()
            )
            .addContent(rootColumn)
            .build()

        val layout = LayoutElementBuilders.Layout.Builder().setRoot(root).build()
        val tile = TileBuilders.Tile.Builder()
            .setResourcesVersion("1")
            .setTileTimeline(TimelineBuilders.Timeline.Builder().addTimelineEntry(TimelineBuilders.TimelineEntry.Builder().setLayout(layout).build()).build())
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
        fun img(id: String, resId: Int) = ResourceBuilders.ImageResource.Builder()
            .setAndroidResourceByResId(ResourceBuilders.AndroidImageResourceByResId.Builder().setResourceId(resId).build())
            .build()
        val res = ResourceBuilders.Resources.Builder()
            .setVersion("1")
            .addIdToImageMapping("ic_zap", img("ic_zap", R.drawable.ic_zap))
            .addIdToImageMapping("ic_thermometer", img("ic_thermometer", R.drawable.ic_thermometer))
            .addIdToImageMapping("ic_droplet", img("ic_droplet", R.drawable.ic_droplet))
            .addIdToImageMapping("ic_leaf", img("ic_leaf", R.drawable.ic_leaf))
            .build()
        return Futures.immediateFuture(res)
    }

    private fun text(s: String, size: Float, c: ColorBuilders.ColorProp, bold: Boolean = false, lines: Int = 2, maxLines: Int = 2, ls: Float = 0f): LayoutElementBuilders.Text {
        val b = LayoutElementBuilders.Text.Builder().setText(s)
            .setFontStyle(font(size, c, bold, ls))
            .setMaxLines(maxLines)
            .setMultilineAlignment(LayoutElementBuilders.TEXT_ALIGN_CENTER)
        if (lines == 1) b.setMaxLines(1).setOverflow(LayoutElementBuilders.TEXT_OVERFLOW_ELLIPSIZE)
        return b.build()
    }

    private fun font(size: Float, c: ColorBuilders.ColorProp, bold: Boolean = false, ls: Float = 0f): LayoutElementBuilders.FontStyle {
        val b = LayoutElementBuilders.FontStyle.Builder()
            .setSize(DimensionBuilders.SpProp.Builder().setValue(size).build())
            .setColor(c)
            .setWeight(LayoutElementBuilders.FontWeightProp.Builder().setValue(if (bold) 700 else 400).build())
        if (ls != 0f) b.setLetterSpacing(DimensionBuilders.EmProp.Builder().setValue(ls).build())
        return b.build()
    }

    private fun launchClickable(): ModifiersBuilders.Clickable =
        ModifiersBuilders.Clickable.Builder()
            .setOnClick(ActionBuilders.LaunchAction.Builder()
                .setAndroidActivity(ActionBuilders.AndroidActivity.Builder()
                    .setPackageName("com.aethersmart.wearos")
                    .setClassName("com.aethersmart.wearos.MainActivity")
                    .build())
                .build())
            .build()

    private fun liveClickable(id: String): ModifiersBuilders.Clickable =
        ModifiersBuilders.Clickable.Builder()
            .setId(id)
            .setOnClick(ActionBuilders.LoadAction.Builder().build())
            .build()
}
