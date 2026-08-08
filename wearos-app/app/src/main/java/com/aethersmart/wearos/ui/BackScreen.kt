package com.aethersmart.wearos.ui

import androidx.compose.foundation.layout.*
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.wear.compose.material.*

@Composable
fun BackScreen(onBack: () -> Unit) {
    Column(
        modifier = Modifier.fillMaxSize(),
        horizontalAlignment = Alignment.CenterHorizontally,
        verticalArrangement = Arrangement.Center
    ) {
        Text("No data", style = MaterialTheme.typography.caption1, textAlign = TextAlign.Center)
        Spacer(Modifier.height(8.dp))
        CompactChip(onClick = onBack, label = { Text("Back") })
    }
}
