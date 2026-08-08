package com.aethersmart.wearos.ui

import androidx.compose.foundation.layout.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.wear.compose.material.*

@Composable
fun PairingScreen(
    code: String?,
    isLoading: Boolean,
    error: String?,
    onRefreshCode: () -> Unit,
    onPaired: () -> Unit,
    isPaired: Boolean,
) {
    // Auto-navigate when paired
    LaunchedEffect(isPaired) { if (isPaired) onPaired() }

    ScalingLazyColumn(
        modifier = Modifier.fillMaxSize(),
        verticalArrangement = Arrangement.spacedBy(8.dp),
        horizontalAlignment = Alignment.CenterHorizontally
    ) {
        item { Text("Pair Watch", style = MaterialTheme.typography.title3, textAlign = TextAlign.Center) }
        item {
            Text(
                "On your phone open Settings → Pair Watch and enter this code. Keep watch awake.",
                style = MaterialTheme.typography.caption2,
                textAlign = TextAlign.Center,
                modifier = Modifier.padding(horizontal = 8.dp)
            )
        }
        item {
            if (isLoading && code == null) {
                CircularProgressIndicator(modifier = Modifier.size(28.dp))
            } else if (code != null) {
                // Big code — readable at arm's length
                Text(
                    code.chunked(3).joinToString(" "),
                    style = MaterialTheme.typography.display1,
                    textAlign = TextAlign.Center,
                    modifier = Modifier.padding(vertical = 4.dp)
                )
                Text("Expires in 5 min", style = MaterialTheme.typography.caption2)
            }
        }
        if (error != null) {
            item { Text(error, color = MaterialTheme.colors.error, style = MaterialTheme.typography.caption2, textAlign = TextAlign.Center) }
        }
        item {
            if (!isPaired) {
                Chip(onClick = onRefreshCode, label = { Text(if (code == null) "Generate code" else "New code") })
            } else {
                Chip(onClick = onPaired, label = { Text("Continue") }, colors = ChipDefaults.primaryChipColors())
            }
        }
        if (code != null && !isPaired) {
            item {
                // Polling indicator
                Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                    CircularProgressIndicator(modifier = Modifier.size(14.dp), strokeWidth = 2.dp)
                    Text("Waiting for phone…", style = MaterialTheme.typography.caption2)
                }
            }
        }
    }
}

private fun String.chunked(n: Int): List<String> = chunkedSequence(n).toList()
