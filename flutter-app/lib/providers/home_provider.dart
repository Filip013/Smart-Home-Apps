import 'dart:async';
import 'dart:math' as math;
import 'package:flutter/foundation.dart';
import '../models/device_state.dart';
import '../services/api_service.dart';
import '../services/auth_service.dart';
import '../services/firestore_service.dart';
import '../services/settings_service.dart';
import '../utils/cost_utils.dart';

class PowerHistoryPoint {
  final DateTime time;
  final double watts;

  PowerHistoryPoint(this.time, this.watts);
}

class HomeProvider extends ChangeNotifier {
  late ApiService _apiService;
  SettingsService? settingsService;
  final AuthService? authService;

  SmartHomeStatus? _status;
  bool _isLoading = false;
  String? _error;
  Timer? _refreshTimer;
  final int _autoRefreshSeconds = 10;

  final List<PowerHistoryPoint> _powerHistory = [];
  final Map<String, List<double>> _sensorTempWaves = {};
  final Map<String, List<double>> _sensorHumidWaves = {};
  List<double> _power24hWave = [];

  double _peakDemandKw = 0.0;
  double _monthlyCostRsd = 0.0;

  SmartHomeStatus? get status => _status;
  bool get isLoading => _isLoading;
  String? get error => _error;
  List<PowerHistoryPoint> get powerHistory => List.unmodifiable(_powerHistory);
  double get peakDemandKw => _peakDemandKw > 0 ? _peakDemandKw : 0.35;

  double get accumulatedKwh {
    final today = _status?.power.todayKwh ?? 0.0;
    if (today > 0) return double.parse(today.toStringAsFixed(2));
    final watts = _status?.power.currentLoadWatts ?? 0.0;
    if (watts > 0) return double.parse((watts * 24.0 / 1000.0).toStringAsFixed(2));
    return 0.0;
  }

  Map<String, List<double>> get sensorTempWaves => _sensorTempWaves;
  Map<String, List<double>> get sensorHumidWaves => _sensorHumidWaves;

  List<double> get power24hWave {
    if (_power24hWave.isNotEmpty) return _power24hWave;
    final watts = _status?.power.currentLoadWatts ?? 301.4;
    return generate24HourPowerWave(watts);
  }

  /// Real month-to-date cost from Firestore energyHistory (high/low tariff).
  /// 0 until signed-in history loads — no projection fallback.
  double get estimatedCost => _monthlyCostRsd;

  HomeProvider({this.settingsService, this.authService}) {
    _apiService = ApiService(settingsService: settingsService, authService: authService);
    authService?.addListener(_reloadMonthlyStats);
    refreshData();
    _loadMonthlyStats();
    startAutoRefresh();
  }

  void updateSettings(SettingsService newSettings) {
    settingsService = newSettings;
    _apiService = ApiService(settingsService: newSettings, authService: authService);
    refreshData();
    _loadMonthlyStats();
  }

  void _reloadMonthlyStats() {
    if (authService?.userUid != null) _loadMonthlyStats();
  }

  /// Loads this month's real energy history (Firestore, signed-in) so the
  /// dashboard's monthly cost tracks real changes — never a projection.
  Future<void> _loadMonthlyStats() async {
    final auth = authService;
    if (auth == null) return;
    final uid = auth.userUid ?? settingsService?.firestoreUserId;
    final idToken = await auth.getIdToken();
    if (uid == null || uid.isEmpty || idToken == null || idToken.isEmpty) return;

    try {
      final history = await FirestoreService.fetchEnergyHistory(userId: uid, idToken: idToken);
      final monthHistory = currentMonthHistory(history);
      _monthlyCostRsd = sumMonthlyCostRsd(monthHistory);
      notifyListeners();
    } catch (e) {
      debugPrint('loadMonthlyStats error: $e');
    }
  }

  void startAutoRefresh() {
    _refreshTimer?.cancel();
    _refreshTimer = Timer.periodic(
      Duration(seconds: _autoRefreshSeconds),
      (_) => refreshData(silent: true),
    );
  }

  Future<void> refreshData({bool silent = false}) async {
    if (!silent) {
      _isLoading = true;
      _error = null;
      notifyListeners();
    }

    try {
      final newStatus = await _apiService.fetchStatus();
      _status = newStatus;
      _error = null;

      if (newStatus.power.status == 'online') {
        final watts = newStatus.power.currentLoadWatts;
        final now = DateTime.now();

        _powerHistory.add(PowerHistoryPoint(now, watts));
        if (_powerHistory.length > 60) {
          _powerHistory.removeAt(0);
        }

        final currentKw = watts / 1000.0;
        if (currentKw > _peakDemandKw) {
          _peakDemandKw = currentKw;
        }
      }

      _applyWorkerHistory(newStatus);
    } catch (e) {
      _error = e.toString();
    } finally {
      _isLoading = false;
      notifyListeners();
    }
  }

  /// Maps the worker's pre-computed 24h history onto the chart waves —
  /// mirrors React's workerService.ts mapping (no local Tuya log math).
  void _applyWorkerHistory(SmartHomeStatus status) {
    _sensorTempWaves.clear();
    _sensorHumidWaves.clear();
    for (final dev in status.devices) {
      if (dev.history.isNotEmpty) {
        _sensorTempWaves[dev.id] =
            dev.history.map((h) => (h['temp'] as num).toDouble()).toList();
        _sensorHumidWaves[dev.id] =
            dev.history.map((h) => (h['humidity'] as num).toDouble()).toList();
      }
    }

    final hourly = status.power.hourlyHistory;
    if (hourly.isNotEmpty) {
      _power24hWave =
          hourly.map((h) => (h['loadWatts'] as num).toDouble()).toList();
    }
  }


  static List<double> generate24HourTempWave(double currentTemp) {
    final List<double> wave = [];
    final now = DateTime.now();
    final baseTemp = currentTemp > 0 ? currentTemp : 25.1;

    for (int i = 23; i >= 0; i--) {
      final hour = now.subtract(Duration(hours: i)).hour;
      final hourRad = ((hour - 6) / 24) * 2 * math.pi;
      final tempFactor = -math.cos(hourRad);
      final temp = double.parse((baseTemp + tempFactor * 2.0).toStringAsFixed(1));
      wave.add(temp);
    }
    return wave;
  }

  static List<double> generate24HourPowerWave(double currentWatts) {
    final List<double> wave = [];
    final now = DateTime.now();
    final base = currentWatts > 0 ? currentWatts : 301.4;

    for (int i = 23; i >= 0; i--) {
      final hour = now.subtract(Duration(hours: i)).hour;
      double load = base;
      if (hour >= 7 && hour <= 9) {
        load = base * 1.35;
      } else if (hour > 9 && hour < 17) {
        load = base * 0.95;
      } else if (hour >= 17 && hour <= 21) {
        load = base * 1.55;
      } else if (hour >= 22 || hour < 6) {
        load = base * 0.70;
      }
      wave.add(double.parse(load.toStringAsFixed(1)));
    }
    return wave;
  }

  static List<double> generate24HourHumidWave(int currentHum) {
    final List<double> wave = [];
    final now = DateTime.now();
    final baseHum = currentHum > 0 ? currentHum : 55;

    for (int i = 23; i >= 0; i--) {
      final hour = now.subtract(Duration(hours: i)).hour;
      final hourRad = ((hour - 6) / 24) * 2 * math.pi;
      final tempFactor = -math.cos(hourRad);
      final hum = (baseHum - tempFactor * 5).round().clamp(0, 100).toDouble();
      wave.add(hum);
    }
    return wave;
  }

  Future<bool> toggleDevice(String deviceId, String code, bool currentValue) async {
    final newValue = !currentValue;
    final success = await _apiService.controlDevice(
      deviceId: deviceId,
      code: code,
      value: newValue,
    );

    if (success) {
      await refreshData(silent: true);
    }
    return success;
  }

  @override
  void dispose() {
    _refreshTimer?.cancel();
    authService?.removeListener(_reloadMonthlyStats);
    super.dispose();
  }
}
