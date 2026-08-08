package com.aethersmart.wearos.ui

import androidx.compose.foundation.layout.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.wear.compose.material.*

val Indigo = Color(0xFF818CF8)
val Emerald = Color(0xFF34D399)
val Amber = Color(0xFFF59E0B)
val Sky = Color(0xFF38BDF8)
val Red = Color(0xFFF87171)

@Composable
fun DashboardScreen(
    state: UiState,
    isRefreshing: Boolean,
    onRefresh: () -> Unit,
    onOpenSettings: () -> Unit,
    onOpenPairing: () -> Unit,
    onOpenPower: () -> Unit,
    onOpenTemp: (Int) -> Unit
) {
    ScalingLazyColumn(
        modifier = Modifier.fillMaxSize(),
        verticalArrangement = Arrangement.spacedBy(8.dp),
        horizontalAlignment = Alignment.CenterHorizontally
    ) {
        item {
            Text("AetherSmart", style = MaterialTheme.typography.title3, textAlign = TextAlign.Center)
        }

        when (state) {
            is UiState.Loading -> {
                item { CircularProgressIndicator(modifier = Modifier.size(26.dp)) }
                item { Text("Loading…", style = MaterialTheme.typography.caption2) }
            }
            is UiState.NeedsSetup -> {
                item { Text("Setup required", color = MaterialTheme.colors.error, style = MaterialTheme.typography.title3) }
                item { Text("Pair from phone: Settings → Pair Watch", style = MaterialTheme.typography.caption2, textAlign = TextAlign.Center) }
                item {
                    Chip(onClick = onOpenPairing, label = { Text("Pair Watch") }, colors = ChipDefaults.primaryChipColors())
                }
                item { CompactChip(onClick = onOpenSettings, label = { Text("Manual Settings") }) }
            }
            is UiState.Error -> {
                item { Text("Error", color = MaterialTheme.colors.error, style = MaterialTheme.typography.title3) }
                item { Text(state.message, style = MaterialTheme.typography.caption2, textAlign = TextAlign.Center) }
                item { Chip(onClick = onRefresh, label = { Text("Retry") }) }
                item { CompactChip(onClick = onOpenSettings, label = { Text("Settings") }) }
            }
            is UiState.Success -> {
                val status = state.data
                val power = status.power
                val sensors = status.sensors

                // ── Power card (tap → 24h detail) ──
                if (power != null) {
                    item {
                        Card(onClick = onOpenPower, modifier = Modifier.fillMaxWidth()) {
                            Column(modifier = Modifier.fillMaxWidth().padding(horizontal = 14.dp, vertical = 12.dp), horizontalAlignment = Alignment.CenterHorizontally) {
                                Text("⚡ ${power.currentLoad?.toInt() ?: 0} W", fontSize = 26.sp, fontWeight = androidx.compose.ui.text.font.FontWeight.Bold, color = Color.White)
                                Text("today ${power.todayKwh ?: 0} kWh", fontSize = 12.sp, color = Color(0xFF94A3B8))
                                Spacer(Modifier.height(8.dp))
                                val loads = power.hourlyHistory.mapNotNull { it.loadWatts?.toFloat() }
                                BarChart(loads, modifier = Modifier.fillMaxWidth().height(64.dp), color = Indigo, peakColor = Amber)
                                if (isRefreshing) {
                                    Spacer(Modifier.height(6.dp))
                                    CircularProgressIndicator(modifier = Modifier.size(14.dp), strokeWidth = 2.dp)
                                }
                            }
                        }
                    }
                }

                // ── Sensor cards (tap → 24h temp/humidity detail) ──
                sensors.forEachIndexed { index, sensor ->
                    item {
                        Card(onClick = { onOpenTemp(index) }, modifier = Modifier.fillMaxWidth()) {
                            Column(modifier = Modifier.fillMaxWidth().padding(horizontal = 14.dp, vertical = 10.dp)) {
                                Row(modifier = Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween, verticalAlignment = Alignment.CenterVertically) {
                                    Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                                        Text("🌡", fontSize = 14.sp)
                                        Text(sensor.name ?: "Sensor", fontSize = 13.sp, color = Color.White, maxLines = 1)
                                    }
                                    sensor.battery?.let { b ->
                                        Text("🔋 ${b.toInt()}%", fontSize = 11.sp, color = if (b < 30) Red else Color(0xFF94A3B8))
                                    }
                                }
                                Spacer(Modifier.height(6.dp))
                                Row(modifier = Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween, verticalAlignment = Alignment.Bottom) {
                                    Column {
                                        Text(
                                            sensor.currentTemp?.let { "%.1f°C".format(it) } ?: "—",
                                            fontSize = 20.sp, fontWeight = androidx.compose.ui.text.font.FontWeight.Bold, color = Color.White
                                        )
                                        Text("${sensor.currentHumidity?.toInt() ?: 0}% RH", fontSize = 11.sp, color = Color(0xFF94A3B8))
                                    }
                                    val temps = sensor.history.mapNotNull { it.temp?.toFloat() }
                                    LineChart(temps, modifier = Modifier.width(120.dp).height(40.dp), color = Indigo, fill = true)
                                }
                            }
                        }
                    }
                }

                item {
                    Row(horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                        CompactChip(onClick = onRefresh, label = { Text("Refresh") })
                        CompactChip(onClick = onOpenSettings, label = { Text("Settings") })
                        CompactChip(onClick = onOpenPairing, label = { Text("Pair") })
                    }
                }
                status.timestamp?.let { ts ->
                    item {
                        Text("Updated ${java.text.SimpleDateFormat("HH:mm", java.util.Locale.getDefault()).format(java.util.Date(ts * 1000))}", fontSize = 10.sp, color = Color(0xFF64748B))
                    }
                }
            }
        }
    }
}
