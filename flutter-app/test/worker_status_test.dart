import 'dart:convert';
import 'dart:io';

import 'package:flutter_test/flutter_test.dart';
import 'package:smart_home_flutter/models/device_state.dart';

void main() {
  test('parses a real worker /api/status response (captured fixture)', () {
    final raw = File('test/fixtures/worker_status.json').readAsStringSync();
    final json = jsonDecode(raw) as Map<String, dynamic>;
    final status = SmartHomeStatus.fromJson(json);

    expect(status.success, isTrue);
    expect(status.devices.length, 2);

    final belgrade = status.devices.first;
    expect(belgrade.name, 'Belgrade Sensor');
    expect(belgrade.location, 'Belgrade');
    expect(belgrade.temperature, 27.4);
    expect(belgrade.humidity, 51);
    expect(belgrade.batteryPercentage, 58);
    expect(belgrade.isOnline, isTrue);
    expect(belgrade.history.length, 24);
    expect(belgrade.history.first['time'], '17:00');
    expect(belgrade.history.first['temp'], 30.1);
    expect(belgrade.history.last['humidity'], 52);

    final vrsac = status.devices[1];
    expect(vrsac.name, 'Vrsac Sensor');
    expect(vrsac.location, 'Vrsac');
    expect(vrsac.temperature, 28);
    expect(vrsac.humidity, 47);
    expect(vrsac.history.length, 24);

    final power = status.power;
    expect(power.currentLoadWatts, 11.6);
    expect(power.voltage, 239.7);
    expect(power.currentAmps, 0.39);
    expect(power.todayKwh, 3.45);
    expect(power.hourlyHistory.length, 24);
    expect(power.hourlyHistory.first['time'], '17:00');
    expect(power.hourlyHistory.first['loadWatts'], 1);
    expect(power.hourlyHistory.last['loadWatts'], 235);
  });

  test('fabricates default sensors only when the worker returns nothing', () {
    final status =
        SmartHomeStatus.fromJson({'success': true, 'sensors': <dynamic>[], 'power': null});
    expect(status.devices.length, 2);
    expect(status.devices.first.name, 'Belgrade Sensor');
    expect(status.power.todayKwh, 0.0);
    expect(status.power.hourlyHistory, isEmpty);
  });
}
