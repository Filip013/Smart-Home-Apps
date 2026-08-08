package com.aethersmart.wearos.ui

import androidx.compose.foundation.layout.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.wear.compose.material.*

@Composable
fun DashboardScreen(
    state: UiState,
    isRefreshing: Boolean,
    onRefresh: () -> Unit,
    onOpenSettings: () -> Unit,
    onOpenPairing: () -> Unit = onOpenSettings,
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
                item { CircularProgressIndicator(modifier = Modifier.size(24.dp)) }
                item { Text("Loading…", style = MaterialTheme.typography.caption2) }
            }
            is UiState.NeedsSetup -> {
                item { Text("Setup required", color = MaterialTheme.colors.error) }
                item { Text("Pair from phone: Settings → Pair Watch", style = MaterialTheme.typography.caption2, textAlign = TextAlign.Center) }
                item {
                    Chip(
                        onClick = onOpenPairing,
                        label = { Text("Pair Watch") },
                        colors = ChipDefaults.primaryChipColors()
                    )
                }
                item { CompactChip(onClick = onOpenSettings, label = { Text("Manual Settings") }) }
            }
            is UiState.Error -> {
                item { Text("Error", color = MaterialTheme.colors.error, style = MaterialTheme.typography.title3) }
                item { Text(state.message, style = MaterialTheme.typography.caption2, textAlign = TextAlign.Center) }
                item {
                    Chip(onClick = onRefresh, label = { Text("Retry") })
                }
                item {
                    CompactChip(onClick = onOpenSettings, label = { Text("Settings") })
                }
            }
            is UiState.Success -> {
                val d = state.data
                // Power
                item {
                    Card(onClick = onRefresh, modifier = Modifier.fillMaxWidth()) {
                        Column(modifier = Modifier.padding(12.dp), horizontalAlignment = Alignment.CenterHorizontally) {
                            Text("⚡ ${d.powerWatts?.toInt() ?: 0} W", style = MaterialTheme.typography.title2)
                            Text("Active Load", style = MaterialTheme.typography.caption2)
                            if (isRefreshing) {
                                Spacer(Modifier.height(6.dp))
                                CircularProgressIndicator(modifier = Modifier.size(16.dp), strokeWidth = 2.dp)
                            }
                        }
                    }
                }
                // Belgrade
                item {
                    Card(onClick = {}, modifier = Modifier.fillMaxWidth()) {
                        Row(
                            modifier = Modifier.fillMaxWidth().padding(10.dp),
                            horizontalArrangement = Arrangement.SpaceBetween,
                            verticalAlignment = Alignment.CenterVertically
                        ) {
                            Column {
                                Text("Belgrade", style = MaterialTheme.typography.caption1)
                                Text(
                                    d.belgrade?.temp?.let { "%.1f°C".format(it) } ?: "—",
                                    style = MaterialTheme.typography.title3
                                )
                            }
                            Text(
                                d.belgrade?.humidity?.let { "${it.toInt()}%" } ?: "—",
                                style = MaterialTheme.typography.body1
                            )
                        }
                    }
                }
                // Vršac
                item {
                    Card(onClick = {}, modifier = Modifier.fillMaxWidth()) {
                        Row(
                            modifier = Modifier.fillMaxWidth().padding(10.dp),
                            horizontalArrangement = Arrangement.SpaceBetween,
                            verticalAlignment = Alignment.CenterVertically
                        ) {
                            Column {
                                Text("Vršac", style = MaterialTheme.typography.caption1)
                                Text(
                                    d.vrsac?.temp?.let { "%.1f°C".format(it) } ?: "—",
                                    style = MaterialTheme.typography.title3
                                )
                            }
                            Text(
                                d.vrsac?.humidity?.let { "${it.toInt()}%" } ?: "—",
                                style = MaterialTheme.typography.body1
                            )
                        }
                    }
                }
                item {
                    Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                        CompactChip(onClick = onRefresh, label = { Text("Refresh") })
                        CompactChip(onClick = onOpenSettings, label = { Text("Settings") })
                        CompactChip(onClick = onOpenPairing, label = { Text("Pair") })
                    }
                }
                d.timestamp?.let { ts ->
                    item {
                        Text(
                            "Updated: ${java.text.SimpleDateFormat("HH:mm:ss", java.util.Locale.getDefault()).format(java.util.Date(ts * 1000))}",
                            style = MaterialTheme.typography.caption2,
                            textAlign = TextAlign.Center
                        )
                    }
                }
            }
        }
    }
}
