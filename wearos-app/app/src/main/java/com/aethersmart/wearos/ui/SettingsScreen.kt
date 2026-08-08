package com.aethersmart.wearos.ui

import androidx.compose.foundation.layout.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import androidx.wear.compose.material.*
import com.aethersmart.wearos.data.WearSettings

@Composable
fun SettingsScreen(
    initial: WearSettings,
    onSave: (WearSettings) -> Unit,
    onBack: () -> Unit
) {
    // WearOS text input is painful — we keep it simple: 3 fields that matter for wear-summary.
    // Device IDs + codes are optional; empty = worker falls back to env/KV.
    var workerUrl by remember { mutableStateOf(initial.workerUrl) }
    var clientId by remember { mutableStateOf(initial.clientId) }
    var clientSecret by remember { mutableStateOf(initial.clientSecret) }
    var region by remember { mutableStateOf(initial.region) }

    // For brevity we expose only the essentials on-watch.
    // Advanced: long-press or phone companion could edit tempDeviceId1 etc. via DataStore directly.
    ScalingLazyColumn(
        modifier = Modifier.fillMaxSize(),
        verticalArrangement = Arrangement.spacedBy(8.dp),
        horizontalAlignment = Alignment.CenterHorizontally
    ) {
        item { Text("Settings", style = MaterialTheme.typography.title3) }
        item { Text("Worker URL is https://your-worker.workers.dev — no trailing slash", style = MaterialTheme.typography.caption2) }

        item {
            Chip(
                onClick = { /* TODO: launch RemoteInput for workerUrl */ },
                label = { Text(if (workerUrl.isBlank()) "Set Worker URL" else workerUrl.take(28)) },
                secondaryLabel = { Text("Tap to edit") }
            )
        }
        item {
            Chip(
                onClick = { /* TODO: RemoteInput */ },
                label = { Text(if (clientSecret.isBlank()) "Set Client Secret" else "••••••••") },
                secondaryLabel = { Text("Bearer auth") }
            )
        }
        item {
            // Simple region picker — cycles eu/us/eu-west
            Chip(
                onClick = { region = when (region) { "eu" -> "us"; "us" -> "eu-west"; else -> "eu" } },
                label = { Text("Region: $region") },
                secondaryLabel = { Text("Tap to cycle") }
            )
        }

        item {
            // On real device this would use RemoteInput intent; for scaffold we provide inline editing via preset values.
            // Replace with androidx.wear.input.RemoteInput in next iteration if you want on-watch keyboard.
            Column(horizontalAlignment = Alignment.CenterHorizontally, verticalArrangement = Arrangement.spacedBy(6.dp)) {
                Text("Quick fill (emulator):", style = MaterialTheme.typography.caption2)
                // Helper to paste full config quickly during dev
                CompactChip(
                    onClick = {
                        // Example — replace with your real values before building release
                        if (workerUrl.isBlank()) workerUrl = "https://smart-home-api.workers.dev"
                    },
                    label = { Text("Fill example URL") }
                )
            }
        }

        item {
            Button(
                onClick = {
                    onSave(
                        initial.copy(
                            workerUrl = workerUrl.trim().trimEnd('/'),
                            clientId = clientId.trim(),
                            clientSecret = clientSecret.trim(),
                            region = region
                        )
                    )
                    onBack()
                },
                modifier = Modifier.fillMaxWidth(0.8f)
            ) {
                Text("Save")
            }
        }
        item {
            CompactChip(onClick = onBack, label = { Text("Back") })
        }
        item {
            Text(
                "Tip: For real text entry, wire RemoteInput (see TODO in SettingsScreen.kt). For now edit via adb: adb shell am broadcast ... or use the companion phone editor.",
                style = MaterialTheme.typography.caption2
            )
        }
    }
}
