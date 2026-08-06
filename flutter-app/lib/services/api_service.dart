import 'dart:convert';
import 'package:http/http.dart' as http;
import '../models/device_state.dart';
import 'auth_service.dart';
import 'firestore_service.dart';
import 'settings_service.dart';

class ApiService {
  final SettingsService? settingsService;
  final AuthService? authService;

  ApiService({this.settingsService, this.authService});

  String get baseUrl =>
      settingsService?.workerUrl ?? 'https://smart-home-api.filip013.workers.dev';

  String get authToken => settingsService?.authToken ?? 'Twirly11';

  Map<String, String> get _headers => {
        'Authorization': 'Bearer $authToken',
        'Content-Type': 'application/json',
      };

  /// Tuya config pulled from Firestore (React's `users/{uid}/settings/tuya`),
  /// cached for the lifetime of this service (status is polled every 10s).
  Map<String, dynamic>? _cachedFirestoreConfig;

  /// Resolves the worker request config the same way React does:
  /// Firestore config (signed-in) first, settings fields as fallback.
  Future<({String? workerUrl, Map<String, String> params})> _resolveWorkerConfig() async {
    final firestoreConfig = await _fetchFirestoreConfig();
    if (firestoreConfig != null) {
      return (
        workerUrl: firestoreConfig['customProxyUrl']?.toString(),
        params: _paramsFromMap(firestoreConfig),
      );
    }
    return (workerUrl: null, params: _paramsFromSettings());
  }

  Future<Map<String, dynamic>?> _fetchFirestoreConfig() async {
    if (_cachedFirestoreConfig != null) return _cachedFirestoreConfig;
    final auth = authService;
    if (auth == null) return null;
    final uid = auth.userUid ?? settingsService?.firestoreUserId;
    final idToken = await auth.getIdToken();
    if (uid == null || uid.isEmpty || idToken == null || idToken.isEmpty) return null;

    final config = await FirestoreService.fetchTuyaConfig(userId: uid, idToken: idToken);
    if (config != null && config['clientSecret'] != null) {
      _cachedFirestoreConfig = config;
    }
    return config;
  }

  /// Mirrors workerService.ts: only the params the config actually has.
  Map<String, String> _paramsFromMap(Map<String, dynamic> cfg) {
    final params = <String, String>{};
    void put(String key, String? value) {
      final v = value?.toString().trim() ?? '';
      if (v.isNotEmpty) params[key] = v;
    }

    for (final key in const [
      'clientId',
      'clientSecret',
      'region',
      'tempDeviceId1',
      'tempDeviceId2',
      'powerDeviceId',
      'tempCode1',
      'humCode1',
      'tempCode2',
      'humCode2',
      'powerCode',
      'voltCode',
      'currCode',
      'energyCode',
      'tempName1',
      'tempLoc1',
      'tempName2',
      'tempLoc2',
      'powerName',
    ]) {
      put(key, cfg[key]?.toString());
    }
    // React maps localTvBoxIp → tvBoxUrl for the worker.
    put('tvBoxUrl', cfg['localTvBoxIp']?.toString());
    return params;
  }

  /// Fallback when not signed in / no Firestore config: settings fields.
  Map<String, String> _paramsFromSettings() {
    final s = settingsService;
    final params = <String, String>{};

    void put(String key, String? value) {
      final v = value?.trim() ?? '';
      if (v.isNotEmpty) params[key] = v;
    }

    put('clientId', s?.clientId);
    put('clientSecret', s?.clientSecret);
    put('region', s?.region);
    put('tempDeviceId1', s?.deviceId1);
    put('tempDeviceId2', s?.deviceId2);
    put('powerDeviceId', s?.powerDeviceId);
    put('tempCode1', 'va_temperature');
    put('humCode1', 'va_humidity');
    put('tempCode2', 'va_temperature');
    put('humCode2', 'va_humidity');
    put('powerCode', 'cur_power');
    put('voltCode', 'cur_voltage');
    put('currCode', 'cur_current');
    put('energyCode', 'add_ele');
    put('tempName1', s?.deviceName1);
    put('tempLoc1', s?.deviceLoc1);
    put('tempName2', s?.deviceName2);
    put('tempLoc2', s?.deviceLoc2);
    put('powerName', s?.powerDeviceName);
    put('tvBoxUrl', s?.tvBoxUrl);

    return params;
  }

  /// Fetches aggregated live status (sensors + power meter) from the worker.
  Future<SmartHomeStatus> fetchStatus() async {
    final resolved = await _resolveWorkerConfig();
    final workerUrl = resolved.workerUrl ?? baseUrl;
    final uri = Uri.parse('$workerUrl/api/status').replace(queryParameters: resolved.params);

    try {
      final response = await http.get(uri, headers: _headers);

      if (response.statusCode == 200) {
        final Map<String, dynamic> data = json.decode(response.body);
        return SmartHomeStatus.fromJson(data);
      }
      throw Exception('Server responded with HTTP ${response.statusCode}: ${response.body}');
    } catch (e) {
      rethrow;
    }
  }

  /// Sends a control command to a Tuya device via the worker.
  Future<bool> controlDevice({
    required String deviceId,
    required String code,
    required dynamic value,
  }) async {
    final resolved = await _resolveWorkerConfig();
    final workerUrl = resolved.workerUrl ?? baseUrl;
    final uri = Uri.parse('$workerUrl/api/control').replace(queryParameters: resolved.params);
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
