package com.aethersmart.wearos.ui

import androidx.compose.foundation.layout.*
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.wear.compose.material.*
import com.aethersmart.wearos.data.WearPower

@Composable
fun PowerDetailScreen(power: WearPower, onBack: () -> Unit) {
    ScalingLazyColumn(
        modifier = Modifier.fillMaxSize(),
        verticalArrangement = Arrangement.spacedBy(8.dp),
        horizontalAlignment = Alignment.CenterHorizontally
    ) {
        item {
            Text("Power · 24h", style = MaterialTheme.typography.title3, textAlign = TextAlign.Center)
        }

        item {
            Card(onClick = {}, modifier = Modifier.fillMaxWidth()) {
                Column(modifier = Modifier.fillMaxWidth().padding(14.dp), horizontalAlignment = Alignment.CenterHorizontally) {
                    Text("⚡ ${power.currentLoad?.toInt() ?: 0} W", fontSize = 30.sp, fontWeight = androidx.compose.ui.text.font.FontWeight.Bold, color = Color.White)
                    Text("Current load", fontSize = 11.sp, color = Color(0xFF94A3B8))
                }
            }
        }

        // 24h bar chart
        val loads = power.hourlyHistory.mapNotNull { it.loadWatts?.toFloat() }
        item {
            Card(onClick = {}, modifier = Modifier.fillMaxWidth()) {
                Column(modifier = Modifier.fillMaxWidth().padding(12.dp)) {
                    Text("Hourly load (W)", fontSize = 12.sp, color = Color(0xFF94A3B8))
                    Spacer(Modifier.height(8.dp))
                    BarChart(loads, modifier = Modifier.fillMaxWidth().height(150.dp), color = Indigo, peakColor = Amber)
                    Spacer(Modifier.height(6.dp))
                    Row(modifier = Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) {
                        Text(power.hourlyHistory.firstOrNull()?.time ?: "—", fontSize = 9.sp, color = Color(0xFF64748B))
                        Text(power.hourlyHistory.lastOrNull()?.time ?: "—", fontSize = 9.sp, color = Color(0xFF64748B))
                    }
                }
            }
        }

        // Stats
        item {
            Card(onClick = {}, modifier = Modifier.fillMaxWidth()) {
                Row(modifier = Modifier.fillMaxWidth().padding(14.dp), horizontalArrangement = Arrangement.SpaceBetween) {
                    Stat("Today", "${power.todayKwh ?: 0} kWh", Color(0xFF34D399))
                    Stat("Voltage", "${power.voltage?.toInt() ?: 0} V", Sky)
                    Stat("Current", "${power.currentAmps ?: 0} A", Indigo)
                }
            }
        }

        item {
            CompactChip(onClick = onBack, label = { Text("Back") }, modifier = Modifier.fillMaxWidth(0.6f))
        }
    }
}

@Composable
private fun Stat(label: String, value: String, color: Color) {
    Column(horizontalAlignment = Alignment.CenterHorizontally) {
        Text(value, fontSize = 15.sp, fontWeight = androidx.compose.ui.text.font.FontWeight.Bold, color = color)
        Text(label, fontSize = 10.sp, color = Color(0xFF94A3B8))
    }
}
