package com.aethersmart.wearos.ui

import androidx.compose.runtime.Composable
import androidx.wear.compose.material.Colors
import androidx.wear.compose.material.MaterialTheme

private val darkColors = Colors(
    primary = androidx.compose.ui.graphics.Color(0xFF818CF8),
    primaryVariant = androidx.compose.ui.graphics.Color(0xFF6366F1),
    secondary = androidx.compose.ui.graphics.Color(0xFF10B981),
    error = androidx.compose.ui.graphics.Color(0xFFEF4444),
    background = androidx.compose.ui.graphics.Color(0xFF0F0F13),
    surface = androidx.compose.ui.graphics.Color(0xFF1A1A1F),
    onPrimary = androidx.compose.ui.graphics.Color.White,
    onSecondary = androidx.compose.ui.graphics.Color.White,
    onError = androidx.compose.ui.graphics.Color.White,
    onBackground = androidx.compose.ui.graphics.Color.White,
    onSurface = androidx.compose.ui.graphics.Color.White,
)

@Composable
fun AetherTheme(content: @Composable () -> Unit) {
    MaterialTheme(colors = darkColors, content = content)
}
