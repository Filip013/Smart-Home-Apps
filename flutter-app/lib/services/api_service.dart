import 'dart:convert';
import 'package:flutter/foundation.dart';
import 'package:http/http.dart' as http;
import '../models/device_state.dart';
import 'settings_service.dart';

class ApiService {
  final SettingsService? settingsService;

  ApiService({this.settingsService});

  String get baseUrl =>
      settingsService?.workerUrl ?? 'https://smart-home-api.filip013.workers.dev';

  String get authToken => settingsService?.authToken ?? 'Twirly11';

  Map<String, String> get _headers => {
        'Authorization': 'Bearer $authToken',
        'Content-Type': 'application/json',
      };

  /// Fetches aggregated live device status for climate sensors and power meter
  Future<SmartHomeStatus> fetchStatus() async {
    final dev1 = settingsService?.deviceId1 ?? 'bf8b4017359259c5b2jnfn';
    final dev2 = settingsService?.deviceId2 ?? 'bf20f914e6de81daa9ylvi';
    final powerDev = settingsService?.powerDeviceId ?? 'bfe14f4085de16419asyyf';

    final ids = [dev1, dev2, powerDev].where((id) => id.isNotEmpty).toList();
    final uri = Uri.parse('$baseUrl/api/status?deviceIds=${ids.join(",")}');

    try {
      final response = await http.get(uri, headers: _headers);

      if (response.statusCode == 200) {
        final Map<String, dynamic> data = json.decode(response.body);

        final name1 = settingsService?.deviceName1 ?? 'Belgrade Sensor';
        final loc1 = settingsService?.deviceLoc1 ?? 'Belgrade';
        final name2 = settingsService?.deviceName2 ?? 'Vršac Sensor';
        final loc2 = settingsService?.deviceLoc2 ?? 'Vršac';

        return SmartHomeStatus.fromJson(
          data,
          nameMap: {
            dev1: name1,
            dev2: name2,
          },
          locMap: {
            dev1: loc1,
            dev2: loc2,
          },
        );
      } else {
        throw Exception('Server responded with HTTP ${response.statusCode}: ${response.body}');
      }
    } catch (e) {
      rethrow;
    }
  }

  /// Fetches 24-hour report logs via existing live Worker CORS proxy (/proxy)
  Future<List<Map<String, dynamic>>> fetchDeviceLogs({
    required String deviceId,
    String codes = 'va_temperature,va_humidity',
  }) async {
    final endTime = DateTime.now().millisecondsSinceEpoch;
    final startTime = endTime - (24 * 60 * 60 * 1000);
    final tuyaPath =
        '/v2.0/cloud/thing/$deviceId/report-logs?codes=$codes&start_time=$startTime&end_time=$endTime&size=100';

    final targetUrl = 'https://openapi.tuyaeu.com$tuyaPath';
    final uri = Uri.parse('$baseUrl/proxy?url=${Uri.encodeComponent(targetUrl)}');

    try {
      final response = await http.get(uri, headers: _headers);
      if (response.statusCode == 200) {
        final data = json.decode(response.body);
        final List<dynamic> logs = data['result']?['logs'] ?? [];
        return logs.cast<Map<String, dynamic>>();
      }
    } catch (e) {
      debugPrint('Error fetching 24h logs via CORS proxy: $e');
    }
    return [];
  }

  /// Sends control command to a Tuya device
  Future<bool> controlDevice({
    required String deviceId,
    required String code,
    required dynamic value,
  }) async {
    final uri = Uri.parse('$baseUrl/api/control');
    final payload = {
      'deviceId': deviceId,
      'commands': [
        {'code': code, 'value': value}
      ]
    };

    try {
      final response = await http.post(
        uri,
        headers: _headers,
        body: json.encode(payload),
      );

      if (response.statusCode == 200) {
        final data = json.decode(response.body);
        return data['success'] == true;
      }
      return false;
    } catch (e) {
      return false;
    }
  }
}
