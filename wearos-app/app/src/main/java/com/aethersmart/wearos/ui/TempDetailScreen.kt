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
import com.aethersmart.wearos.data.WearSensor

@Composable
fun TempDetailScreen(sensor: WearSensor, onBack: () -> Unit) {
    var metric by remember { mutableStateOf("temp") }
    ScalingLazyColumn(
        modifier = Modifier.fillMaxSize(),
        verticalArrangement = Arrangement.spacedBy(8.dp),
        horizontalAlignment = Alignment.CenterHorizontally
    ) {
        item {
            Text(sensor.name ?: "Sensor", style = MaterialTheme.typography.title3, textAlign = TextAlign.Center)
        }

        item {
            Card(onClick = {}, modifier = Modifier.fillMaxWidth()) {
                Column(modifier = Modifier.fillMaxWidth().padding(14.dp), horizontalAlignment = Alignment.CenterHorizontally) {
                    Text(
                        sensor.currentTemp?.let { "%.1f°C".format(it) } ?: "—",
                        fontSize = 32.sp, fontWeight = androidx.compose.ui.text.font.FontWeight.Bold, color = Color.White
                    )
                    Text("${sensor.currentHumidity?.toInt() ?: 0}% RH · 🔋 ${sensor.battery?.toInt() ?: 0}%", fontSize = 12.sp, color = Color(0xFF94A3B8))
                }
            }
        }

        // metric toggle
        item {
            Row(horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                CompactChip(
                    onClick = { metric = "temp" },
                    label = { Text("Temp") },
                    colors = if (metric == "temp") ChipDefaults.primaryChipColors() else ChipDefaults.secondaryChipColors()
                )
                CompactChip(
                    onClick = { metric = "humidity" },
                    label = { Text("Humidity") },
                    colors = if (metric == "humidity") ChipDefaults.secondaryChipColors() else ChipDefaults.primaryChipColors()
                )
            }
        }

        // 24h chart
        item {
            Card(onClick = {}, modifier = Modifier.fillMaxWidth()) {
                Column(modifier = Modifier.fillMaxWidth().padding(12.dp)) {
                    Text(if (metric == "temp") "24h temperature" else "24h humidity", fontSize = 12.sp, color = Color(0xFF94A3B8))
                    Spacer(Modifier.height(8.dp))
                    if (metric == "temp") {
                        LineChart(sensor.history.mapNotNull { it.temp?.toFloat() }, modifier = Modifier.fillMaxWidth().height(160.dp), color = Indigo, fill = true)
                    } else {
                        LineChart(sensor.history.mapNotNull { it.humidity?.toFloat() }, modifier = Modifier.fillMaxWidth().height(160.dp), color = Emerald, fill = true)
                    }
                    Spacer(Modifier.height(6.dp))
                    Row(modifier = Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) {
                        Text(sensor.history.firstOrNull()?.time ?: "—", fontSize = 9.sp, color = Color(0xFF64748B))
                        Text(sensor.history.lastOrNull()?.time ?: "—", fontSize = 9.sp, color = Color(0xFF64748B))
                    }
                }
            }
        }

        item {
            CompactChip(onClick = onBack, label = { Text("Back") }, modifier = Modifier.fillMaxWidth(0.6f))
        }
    }
}
