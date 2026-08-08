package com.aethersmart.wearos.ui

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.aethersmart.wearos.data.PairingRepository
import com.aethersmart.wearos.data.SettingsRepository
import com.aethersmart.wearos.data.WearSettings
import com.aethersmart.wearos.data.WearStatusResponse
import com.aethersmart.wearos.data.WearSummaryApi
import com.aethersmart.wearos.data.toWearSettings
import kotlinx.coroutines.Job
import kotlinx.coroutines.flow.*
import kotlinx.coroutines.launch

sealed interface UiState {
    data object Loading : UiState
    data class Success(val data: WearStatusResponse) : UiState
    data class Error(val message: String) : UiState
    data object NeedsSetup : UiState
}

class WearViewModel(
    private val settingsRepo: SettingsRepository,
    private val api: WearSummaryApi = WearSummaryApi(),
    private val pairingRepo: PairingRepository = PairingRepository(),
) : ViewModel() {

    val settingsFlow: StateFlow<WearSettings> = settingsRepo.settingsFlow
        .stateIn(viewModelScope, SharingStarted.WhileSubscribed(5000), WearSettings())

    private val _uiState = MutableStateFlow<UiState>(UiState.Loading)
    val uiState: StateFlow<UiState> = _uiState.asStateFlow()

    private val _isRefreshing = MutableStateFlow(false)
    val isRefreshing: StateFlow<Boolean> = _isRefreshing.asStateFlow()

    fun refresh() {
        viewModelScope.launch {
            val s = settingsFlow.value
            if (s.workerUrl.isBlank() || s.clientSecret.isBlank()) {
                _uiState.value = UiState.NeedsSetup
                return@launch
            }
            _isRefreshing.value = true
            if (_uiState.value !is UiState.Success) _uiState.value = UiState.Loading
            val result = api.fetchWearStatus(s)
            result.onSuccess { _uiState.value = UiState.Success(it) }
                .onFailure { _uiState.value = UiState.Error(it.message ?: "Unknown error") }
            _isRefreshing.value = false
        }
    }

    fun saveSettings(settings: WearSettings) {
        viewModelScope.launch {
            settingsRepo.save(settings)
        }
    }

    // ── Pairing ──
    private val _pairCode = MutableStateFlow<String?>(null)
    val pairCode: StateFlow<String?> = _pairCode.asStateFlow()
    private val _pairLoading = MutableStateFlow(false)
    val pairLoading: StateFlow<Boolean> = _pairLoading.asStateFlow()
    private val _pairError = MutableStateFlow<String?>(null)
    val pairError: StateFlow<String?> = _pairError.asStateFlow()
    private val _pairPaired = MutableStateFlow(false)
    val pairPaired: StateFlow<Boolean> = _pairPaired.asStateFlow()
    private var pollJob: Job? = null

    fun startPairing() {
        if (_pairLoading.value) return
        viewModelScope.launch {
            _pairLoading.value = true
            _pairError.value = null
            _pairPaired.value = false
            val res = pairingRepo.register()
            res.onSuccess { code ->
                _pairCode.value = code
                _pairLoading.value = false
                pollJob?.cancel()
                pollJob = viewModelScope.launch {
                    val pollRes = pairingRepo.pollUntilClaimed(code)
                    pollRes.onSuccess { cfg ->
                        settingsRepo.save(cfg.toWearSettings())
                        _pairPaired.value = true
                        // auto-refresh dashboard with new creds
                        refresh()
                    }.onFailure { e ->
                        _pairError.value = e.message ?: "Pairing failed"
                    }
                }
            }.onFailure { e ->
                _pairLoading.value = false
                _pairError.value = e.message ?: "Could not get code"
            }
        }
    }

    fun cancelPairing() {
        pollJob?.cancel()
        _pairLoading.value = false
    }
}
