import 'package:flutter/foundation.dart';
import 'package:shared_preferences/shared_preferences.dart';

class SettingsService {
  static const String _keyWorkerUrl = 'worker_url';
  static const String _keyDeviceId1 = 'device_id_1';
  static const String _keyDeviceName1 = 'device_name_1';
  static const String _keyDeviceLoc1 = 'device_loc_1';
  static const String _keyDeviceId2 = 'device_id_2';
  static const String _keyDeviceName2 = 'device_name_2';
  static const String _keyDeviceLoc2 = 'device_loc_2';
  static const String _keyPowerDeviceId = 'power_device_id';
  static const String _keyPowerDeviceName = 'power_device_name';
  static const String _keyPowerDeviceLoc = 'power_device_loc';
  static const String _keyTvBoxUrl = 'tv_box_url';
  static const String _keyFirestoreUserId = 'firestore_user_id';
  static const String _keyClientId = 'tuya_client_id';
  static const String _keyClientSecret = 'tuya_client_secret';
  static const String _keyRegion = 'tuya_region';

  final SharedPreferences? _prefs;

  String _memWorkerUrl = 'https://smart-home-api.filip013.workers.dev';
  String _memDeviceId1 = 'bf8b4017359259c5b2jnfn';
  String _memDeviceName1 = 'Belgrade Sensor';
  String _memDeviceLoc1 = 'Belgrade';
  String _memDeviceId2 = 'bf20f914e6de81daa9ylvi';
  String _memDeviceName2 = 'Vršac Sensor';
  String _memDeviceLoc2 = 'Vršac';
  String _memPowerDeviceId = 'bfe14f4085de16419asyyf';
  String _memPowerDeviceName = 'Power Monitor';
  String _memPowerDeviceLoc = 'Belgrade';
  String _memTvBoxUrl = 'http://filip013.duckdns.org/live';
  String _memFirestoreUserId = '';
  String _memClientId = '';
  String _memClientSecret = '';
  String _memRegion = 'eu';

  SettingsService(this._prefs);

  static Future<SettingsService> init() async {
    try {
      final prefs = await SharedPreferences.getInstance();
      return SettingsService(prefs);
    } catch (e) {
      debugPrint('SharedPreferences plugin init fallback: $e');
      return SettingsService(null);
    }
  }

  String get workerUrl => _prefs?.getString(_keyWorkerUrl) ?? _memWorkerUrl;
  String get deviceId1 => _prefs?.getString(_keyDeviceId1) ?? _memDeviceId1;
  String get deviceName1 => _prefs?.getString(_keyDeviceName1) ?? _memDeviceName1;
  String get deviceLoc1 => _prefs?.getString(_keyDeviceLoc1) ?? _memDeviceLoc1;
  String get deviceId2 => _prefs?.getString(_keyDeviceId2) ?? _memDeviceId2;
  String get deviceName2 => _prefs?.getString(_keyDeviceName2) ?? _memDeviceName2;
  String get deviceLoc2 => _prefs?.getString(_keyDeviceLoc2) ?? _memDeviceLoc2;
  String get powerDeviceId => _prefs?.getString(_keyPowerDeviceId) ?? _memPowerDeviceId;
  String get powerDeviceName => _prefs?.getString(_keyPowerDeviceName) ?? _memPowerDeviceName;
  String get powerDeviceLoc => _prefs?.getString(_keyPowerDeviceLoc) ?? _memPowerDeviceLoc;
  String get tvBoxUrl => _prefs?.getString(_keyTvBoxUrl) ?? _memTvBoxUrl;
  String get firestoreUserId => _prefs?.getString(_keyFirestoreUserId) ?? _memFirestoreUserId;
  String get clientId => _prefs?.getString(_keyClientId) ?? _memClientId;
  String get clientSecret => _prefs?.getString(_keyClientSecret) ?? _memClientSecret;
  String get region => _prefs?.getString(_keyRegion) ?? _memRegion;

  Future<void> saveSettings({
    required String workerUrl,
    required String deviceId1,
    required String deviceName1,
    required String deviceLoc1,
    required String deviceId2,
    required String deviceName2,
    required String deviceLoc2,
    required String powerDeviceId,
    required String powerDeviceName,
    required String powerDeviceLoc,
    required String tvBoxUrl,
    required String firestoreUserId,
    required String clientId,
    required String clientSecret,
    required String region,
  }) async {
    _memWorkerUrl = workerUrl.trim();
    _memDeviceId1 = deviceId1.trim();
    _memDeviceName1 = deviceName1.trim();
    _memDeviceLoc1 = deviceLoc1.trim();
    _memDeviceId2 = deviceId2.trim();
    _memDeviceName2 = deviceName2.trim();
    _memDeviceLoc2 = deviceLoc2.trim();
    _memPowerDeviceId = powerDeviceId.trim();
    _memPowerDeviceName = powerDeviceName.trim();
    _memPowerDeviceLoc = powerDeviceLoc.trim();
    _memTvBoxUrl = tvBoxUrl.trim();
    _memFirestoreUserId = firestoreUserId.trim();
    _memClientId = clientId.trim();
    _memClientSecret = clientSecret.trim();
    _memRegion = region.trim().isEmpty ? 'eu' : region.trim();

    final prefs = _prefs;
    if (prefs != null) {
      try {
        await prefs.setString(_keyWorkerUrl, _memWorkerUrl);
        await prefs.setString(_keyDeviceId1, _memDeviceId1);
        await prefs.setString(_keyDeviceName1, _memDeviceName1);
        await prefs.setString(_keyDeviceLoc1, _memDeviceLoc1);
        await prefs.setString(_keyDeviceId2, _memDeviceId2);
        await prefs.setString(_keyDeviceName2, _memDeviceName2);
        await prefs.setString(_keyDeviceLoc2, _memDeviceLoc2);
        await prefs.setString(_keyPowerDeviceId, _memPowerDeviceId);
        await prefs.setString(_keyPowerDeviceName, _memPowerDeviceName);
        await prefs.setString(_keyPowerDeviceLoc, _memPowerDeviceLoc);
        await prefs.setString(_keyTvBoxUrl, _memTvBoxUrl);
        await prefs.setString(_keyFirestoreUserId, _memFirestoreUserId);
        await prefs.setString(_keyClientId, _memClientId);
        await prefs.setString(_keyClientSecret, _memClientSecret);
        await prefs.setString(_keyRegion, _memRegion);
      } catch (e) {
        debugPrint('Failed to save to SharedPreferences: $e');
      }
    }
  }
}
