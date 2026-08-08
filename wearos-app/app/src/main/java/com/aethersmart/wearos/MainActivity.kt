package com.aethersmart.wearos

import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.compose.runtime.*
import androidx.lifecycle.viewmodel.compose.viewModel
import androidx.navigation.compose.NavHost
import androidx.navigation.compose.composable
import androidx.navigation.compose.rememberNavController
import androidx.wear.compose.material.*
import com.aethersmart.wearos.data.PairingRepository
import com.aethersmart.wearos.data.SettingsRepository
import com.aethersmart.wearos.data.WearSummaryApi
import com.aethersmart.wearos.ui.*

class MainActivity : ComponentActivity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        val repo = SettingsRepository(applicationContext)
        val api = WearSummaryApi()
        val pairingRepo = PairingRepository()

        setContent {
            AetherTheme {
                val navController = rememberNavController()
                val vm: WearViewModel = androidx.lifecycle.viewmodel.compose.viewModel(
                    factory = object : androidx.lifecycle.ViewModelProvider.Factory {
                        @Suppress("UNCHECKED_CAST")
                        override fun <T : androidx.lifecycle.ViewModel> create(modelClass: Class<T>): T {
                            return WearViewModel(repo, api, pairingRepo) as T
                        }
                    }
                )
                val uiState by vm.uiState.collectAsState()
                val isRefreshing by vm.isRefreshing.collectAsState()
                val settings by vm.settingsFlow.collectAsState(initial = com.aethersmart.wearos.data.WearSettings())
                val pairCode by vm.pairCode.collectAsState()
                val pairLoading by vm.pairLoading.collectAsState()
                val pairError by vm.pairError.collectAsState()
                val pairPaired by vm.pairPaired.collectAsState()

                LaunchedEffect(Unit) { vm.refresh() }
                // If NeedsSetup, auto-navigate to pairing
                LaunchedEffect(uiState) {
                    if (uiState is UiState.NeedsSetup && navController.currentDestination?.route == "dashboard") {
                        navController.navigate("pairing")
                    }
                }

                NavHost(navController = navController, startDestination = "dashboard") {
                    composable("dashboard") {
                        DashboardScreen(
                            state = uiState,
                            isRefreshing = isRefreshing,
                            onRefresh = { vm.refresh() },
                            onOpenSettings = { navController.navigate("settings") },
                            onOpenPairing = { navController.navigate("pairing") }
                        )
                    }
                    composable("pairing") {
                        LaunchedEffect(Unit) { if (pairCode == null && !pairLoading) vm.startPairing() }
                        PairingScreen(
                            code = pairCode,
                            isLoading = pairLoading,
                            error = pairError,
                            onRefreshCode = { vm.startPairing() },
                            onPaired = {
                                navController.popBackStack("dashboard", inclusive = false)
                                vm.refresh()
                            },
                            isPaired = pairPaired
                        )
                    }
                    composable("settings") {
                        SettingsScreen(
                            initial = settings,
                            onSave = { vm.saveSettings(it) },
                            onBack = { navController.popBackStack() }
                        )
                    }
                }
            }
        }
    }
}
