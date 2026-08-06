import 'package:flutter_test/flutter_test.dart';
import 'package:smart_home_flutter/services/firestore_service.dart';

void main() {
  group('unwrapFields (Firestore REST -> plain values)', () {
    test('unwraps a climateHistory doc the way the admin SDK writes it', () {
      // Exact REST representation of a doc written by record_history.py:
      // climate_ref.set({'date': ..., 'sensors': {sensor1: {avgTemp, ...}}})
      final fields = <String, dynamic>{
        'date': {'stringValue': '2026-08-01'},
        'sensors': {
          'mapValue': {
            'fields': {
              'sensor1': {
                'mapValue': {
                  'fields': {
                    'avgTemp': {'doubleValue': 26.6},
                    'minTemp': {'doubleValue': 26.1},
                    'maxTemp': {'doubleValue': 27.4},
                    'avgHumidity': {'integerValue': '53'},
                    'hourly': {
                      'arrayValue': {
                        'values': [
                          {
                            'mapValue': {
                              'fields': {
                                'hour': {'integerValue': '0'},
                                'temp': {'doubleValue': 26.1},
                                'humidity': {'integerValue': '52'},
                              }
                            }
                          }
                        ]
                      }
                    },
                  }
                }
              },
              'sensor2': {
                'mapValue': {
                  'fields': {
                    'avgTemp': {'doubleValue': 27.0},
                    'avgHumidity': {'integerValue': '51'},
                  }
                }
              },
            }
          }
        },
      };

      final unwrapped = FirestoreService.unwrapFields(fields);

      expect(unwrapped['date'], '2026-08-01');
      final sensors = unwrapped['sensors'] as Map<String, dynamic>;
      final sensor1 = sensors['sensor1'] as Map<String, dynamic>;
      expect(sensor1['avgTemp'], 26.6);
      expect(sensor1['avgHumidity'], 53);
      final hourly = sensor1['hourly'] as List<dynamic>;
      expect(hourly, hasLength(1));
      expect((hourly.first as Map<String, dynamic>)['temp'], 26.1);
      final sensor2 = sensors['sensor2'] as Map<String, dynamic>;
      expect(sensor2['avgTemp'], 27.0);
      expect(sensor2['avgHumidity'], 51);
    });

    test('energyHistory doc unwraps kwh/peakKw/cost/hourly', () {
      final fields = <String, dynamic>{
        'kwh': {'doubleValue': 3.4},
        'peakKw': {'doubleValue': 0.5},
        'cost': {'doubleValue': 38.2},
        'hourly': {
          'arrayValue': {
            'values': [
              {'doubleValue': 0.1},
              {'doubleValue': 0.3},
            ]
          }
        },
      };

      final unwrapped = FirestoreService.unwrapFields(fields);
      expect(unwrapped['kwh'], 3.4);
      expect(unwrapped['hourly'] as List<dynamic>, hasLength(2));
    });

    test('missing/null fields stay null (N/A handling)', () {
      final fields = <String, dynamic>{
        'sensor1': {
          'mapValue': {
            'fields': {'avgTemp': {'nullValue': null}},
          }
        },
      };
      final unwrapped = FirestoreService.unwrapFields(fields);
      final sensor1 = (unwrapped['sensor1'] as Map<String, dynamic>);
      expect(sensor1['avgTemp'], isNull);
    });
  });
}
