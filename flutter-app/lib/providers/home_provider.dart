import 'dart:async';
import 'dart:math' as math;
import 'package:flutter/foundation.dart';
import '../models/device_state.dart';
import '../services/api_service.dart';
import '../services/settings_service.dart';

class PowerHistoryPoint {
  final DateTime time;
  final double watts;

  PowerHistoryPoint(this.time, this.watts);
}

class HomeProvider extends ChangeNotifier {
  late ApiService _apiService;
  SettingsService? settingsService;

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

  SmartHomeStatus? get status => _status;
  bool get isLoading => _isLoading;
  String? get error => _error;
  List<PowerHistoryPoint> get powerHistory => List.unmodifiable(_powerHistory);
  double get peakDemandKw => _peakDemandKw > 0 ? _peakDemandKw : 0.35;

  double get accumulatedKwh {
    if (_power24hWave.isNotEmpty) {
      final sumWatts = _power24hWave.reduce((a, b) => a + b);
      return double.parse((sumWatts / 1000.0 * 0.17).toStringAsFixed(2));
    }
    final watts = _status?.power.currentLoadWatts ?? 301.4;
    return double.parse((watts * 24.0 / 1000.0 * 0.17).toStringAsFixed(2));
  }

  Map<String, List<double>> get sensorTempWaves => _sensorTempWaves;
  Map<String, List<double>> get sensorHumidWaves => _sensorHumidWaves;

  List<double> get power24hWave {
    if (_power24hWave.isNotEmpty) return _power24hWave;
    final watts = _status?.power.currentLoadWatts ?? 301.4;
    return generate24HourPowerWave(watts);
  }

  double get estimatedCost {
    final rsd = accumulatedKwh * 30 * 7.0;
    return rsd > 0 ? double.parse(rsd.toStringAsFixed(0)) : 261.0;
  }

  HomeProvider({this.settingsService}) {
    _apiService = ApiService(settingsService: settingsService);
    refreshData();
    startAutoRefresh();
  }

  void updateSettings(SettingsService newSettings) {
    settingsService = newSettings;
    _apiService = ApiService(settingsService: newSettings);
    refreshData();
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

      await _processDeviceLogs(newStatus.devices);
      await _processPowerLogs();
    } catch (e) {
      _error = e.toString();
    } finally {
      _isLoading = false;
      notifyListeners();
    }
  }

  Future<void> _processDeviceLogs(List<SensorDevice> devices) async {
    for (var dev in devices) {
      if (dev.id.isEmpty) continue;
      try {
        List<dynamic> logs = dev.logs;
        if (logs.isEmpty) {
          logs = await _apiService.fetchDeviceLogs(
            deviceId: dev.id,
            codes: 'va_temperature,va_humidity,temp_current,humidity_value',
          );
        }

        final isBelgrade = dev.id.contains('bf8b') || dev.name.toLowerCase().contains('belgrade');

        final history = _processHourlyTempAndHumidity(
          logs: logs,
          tCode: 'va_temperature',
          hCode: 'va_humidity',
          fallbackTemp: (dev.temperature != null && dev.temperature! > 0)
              ? dev.temperature!
              : (isBelgrade ? 25.1 : 26.3),
          fallbackHum: (dev.humidity != null && dev.humidity! > 0)
              ? dev.humidity!
              : (isBelgrade ? 55 : 48),
        );

        _sensorTempWaves[dev.id] = history.map((h) => h['temp'] as double).toList();
        _sensorHumidWaves[dev.id] = history.map((h) => h['humidity'] as double).toList();
      } catch (e) {
        debugPrint('Error processing 24h logs for device ${dev.id}: $e');
      }
    }
  }

  Future<void> _processPowerLogs() async {
    final powerDevId = settingsService?.powerDeviceId ?? 'bfe14f4085de16419asyyf';
    final liveWatts = _status?.power.currentLoadWatts ?? 301.4;
    final fallbackWatts = liveWatts > 0 ? liveWatts : 301.4;

    if (powerDevId.isEmpty) {
      _power24hWave = generate24HourPowerWave(fallbackWatts);
      return;
    }

    try {
      final logs = await _apiService.fetchDeviceLogs(
        deviceId: powerDevId,
        codes: 'cur_power,cur_voltage,cur_current,power',
      );

      final powerWave = _processHourlyPowerWave(
        logs: logs,
        fallbackWatts: fallbackWatts,
      );

      _power24hWave = powerWave;
    } catch (e) {
      _power24hWave = generate24HourPowerWave(fallbackWatts);
    }
  }

  /// 1:1 Port of React deviceBridge.ts fetchRealTempHistory (lines 65-168)
  List<Map<String, dynamic>> _processHourlyTempAndHumidity({
    required List<dynamic> logs,
    required String tCode,
    required String hCode,
    required double fallbackTemp,
    required int fallbackHum,
  }) {
    final now = DateTime.now();
    final List<Map<String, dynamic>> buckets = [];

    for (int i = 23; i >= 0; i--) {
      final d = now.subtract(Duration(hours: i));
      final hourStr = '${d.hour.toString().padLeft(2, '0')}:00';
      final startMs = DateTime(d.year, d.month, d.day, d.hour, 0, 0).millisecondsSinceEpoch;
      final endMs = startMs + (60 * 60 * 1000);
      buckets.add({
        'hourStr': hourStr,
        'startMs': startMs,
        'endMs': endMs,
        'temps': <double>[],
        'hums': <double>[],
      });
    }

    for (var log in logs) {
      if (log is Map<String, dynamic> && log['event_time'] is num) {
        final int eventMs = (log['event_time'] as num).toInt();
        final code = log['code']?.toString() ?? '';
        final val = log['value'];

        for (var b in buckets) {
          final startMs = b['startMs'] as int;
          final endMs = b['endMs'] as int;
          if (eventMs >= startMs && eventMs < endMs) {
            if ((code == tCode || code == 'va_temperature' || code == 'temp_current' || code == 'temp') && val != null) {
              final double raw = val is num ? val.toDouble() : (double.tryParse(val.toString()) ?? 0.0);
              if (raw > 0) {
                final double scaled = raw > 100 ? raw / 10.0 : raw;
                (b['temps'] as List<double>).add(scaled);
              }
            } else if ((code == hCode || code == 'va_humidity' || code == 'humidity_value' || code == 'humidity') && val != null) {
              final double raw = val is num ? val.toDouble() : (double.tryParse(val.toString()) ?? 0.0);
              if (raw > 0) {
                final double scaled = raw > 100 ? raw / 10.0 : raw;
                (b['hums'] as List<double>).add(scaled);
              }
            }
            break;
          }
        }
      }
    }

    double? currentTemp;
    double? currentHum;
    final List<Map<String, dynamic>> mapped = [];

    for (var b in buckets) {
      final temps = b['temps'] as List<double>;
      final hums = b['hums'] as List<double>;

      if (temps.isNotEmpty) {
        currentTemp = double.parse((temps.reduce((a, b) => a + b) / temps.length).toStringAsFixed(1));
      }
      if (hums.isNotEmpty) {
        currentHum = (hums.reduce((a, b) => a + b) / hums.length).roundToDouble();
      }

      mapped.add({
        'time': b['hourStr'],
        'temp': currentTemp,
        'humidity': currentHum,
      });
    }

    final double firstValidTemp = (mapped.firstWhere((m) => m['temp'] != null, orElse: () => {})['temp'] as double?) ?? fallbackTemp;
    final double firstValidHum = (mapped.firstWhere((m) => m['humidity'] != null, orElse: () => {})['humidity'] as double?) ?? fallbackHum.toDouble();

    double runningTemp = firstValidTemp;
    double runningHum = firstValidHum;

    return mapped.map((m) {
      if (m['temp'] != null) runningTemp = m['temp'] as double;
      if (m['humidity'] != null) runningHum = m['humidity'] as double;
      return {
        'time': m['time'],
        'temp': runningTemp,
        'humidity': runningHum,
      };
    }).toList();
  }

  /// 1:1 Port of React deviceBridge.ts fetchRealPowerHistory (lines 242-324)
  List<double> _processHourlyPowerWave({
    required List<dynamic> logs,
    required double fallbackWatts,
  }) {
    final now = DateTime.now();
    final List<Map<String, dynamic>> buckets = [];

    for (int i = 23; i >= 0; i--) {
      final d = now.subtract(Duration(hours: i));
      final startMs = DateTime(d.year, d.month, d.day, d.hour, 0, 0).millisecondsSinceEpoch;
      final endMs = startMs + (60 * 60 * 1000);
      buckets.add({
        'startMs': startMs,
        'endMs': endMs,
        'loads': <double>[],
      });
    }

    for (var log in logs) {
      if (log is Map<String, dynamic> && log['event_time'] is num) {
        final int eventMs = (log['event_time'] as num).toInt();
        final code = log['code']?.toString() ?? '';
        final val = log['value'];

        if ((code == 'cur_power' || code == 'power') && val != null) {
          final double raw = val is num ? val.toDouble() : (double.tryParse(log['value'].toString()) ?? 0.0);
          if (raw > 0) {
            final double watts = raw > 1000 ? raw / 10.0 : raw;
            for (var b in buckets) {
              final startMs = b['startMs'] as int;
              final endMs = b['endMs'] as int;
              if (eventMs >= startMs && eventMs < endMs) {
                (b['loads'] as List<double>).add(watts);
                break;
              }
            }
          }
        }
      }
    }

    double? currentLoad;
    final List<double?> mapped = [];

    for (var b in buckets) {
      final loads = b['loads'] as List<double>;
      if (loads.isNotEmpty) {
        currentLoad = double.parse((loads.reduce((a, b) => a + b) / loads.length).toStringAsFixed(1));
      }
      mapped.add(currentLoad);
    }

    final double firstValidLoad = mapped.firstWhere((l) => l != null && l > 0, orElse: () => fallbackWatts) ?? fallbackWatts;

    double runningLoad = firstValidLoad;
    return mapped.map((l) {
      if (l != null && l > 0) runningLoad = l;
      return runningLoad;
    }).toList();
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
    super.dispose();
  }
}
