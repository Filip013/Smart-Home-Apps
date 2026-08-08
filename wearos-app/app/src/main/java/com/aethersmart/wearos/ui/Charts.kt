package com.aethersmart.wearos.ui

import androidx.compose.foundation.Canvas
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.geometry.Size
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.Path
import androidx.compose.ui.graphics.StrokeCap
import androidx.compose.ui.graphics.drawscope.Stroke

@Composable
fun BarChart(
    values: List<Float>,
    modifier: Modifier = Modifier,
    color: Color = Color(0xFF818CF8),
    peakColor: Color = Color(0xFFF59E0B)
) {
    if (values.isEmpty()) return
    val max = values.maxOrNull()?.takeIf { it > 0f } ?: 1f
    Canvas(modifier = modifier) {
        val slot = size.width / values.size
        val barW = slot * 0.55f
        val peak = values.maxOrNull()
        values.forEachIndexed { i, v ->
            val h = (v / max) * size.height
            val x = i * slot + (slot - barW) / 2f
            drawRect(
                color = if (v == peak) peakColor else color,
                topLeft = Offset(x, size.height - h),
                size = Size(barW, h)
            )
        }
    }
}

@Composable
fun LineChart(
    values: List<Float>,
    modifier: Modifier = Modifier,
    color: Color = Color(0xFF34D399),
    fill: Boolean = true
) {
    if (values.isEmpty()) return
    val max = values.maxOrNull() ?: 0f
    val min = values.minOrNull() ?: 0f
    val range = (max - min).takeIf { it > 0f } ?: 1f
    Canvas(modifier = modifier) {
        if (values.size == 1) {
            drawCircle(color, radius = 3f, center = Offset(size.width / 2, size.height / 2))
            return@Canvas
        }
        val stepX = size.width / (values.size - 1)
        fun y(v: Float) = size.height - ((v - min) / range) * size.height * 0.85f - size.height * 0.075f
        val line = Path()
        values.forEachIndexed { i, v ->
            val x = i * stepX; val yy = y(v)
            if (i == 0) line.moveTo(x, yy) else line.lineTo(x, yy)
        }
        if (fill) {
            val fillPath = Path().apply {
                moveTo(0f, size.height)
                values.forEachIndexed { i, v -> lineTo(i * stepX, y(v)) }
                lineTo(size.width, size.height)
                close()
            }
            drawPath(fillPath, color.copy(alpha = 0.22f))
        }
        drawPath(line, color, style = Stroke(width = 2.5f, cap = StrokeCap.Round))
    }
}
