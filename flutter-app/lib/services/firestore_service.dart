import 'dart:convert';
import 'package:flutter/foundation.dart';
import 'package:http/http.dart' as http;

class FirestoreService {
  static const String projectId = 'gen-lang-client-0142372615';
  static const String baseUrl =
      'https://firestore.googleapis.com/v1/projects/$projectId/databases/(default)/documents/artifacts/smart-home-apps/users';

  /// Fetches daily energy records from Firestore energyHistory collection
  static Future<List<Map<String, dynamic>>> fetchEnergyHistory({String? userId}) async {
    String targetUid = userId?.trim() ?? '';
    if (targetUid.isEmpty) {
      targetUid = await _discoverUserUid();
    }
    if (targetUid.isEmpty) return [];

    final url = Uri.parse('$baseUrl/$targetUid/energyHistory');

    try {
      final response = await http.get(url);
      if (response.statusCode == 200) {
        final Map<String, dynamic> data = json.decode(response.body);
        final documents = data['documents'] as List<dynamic>? ?? [];

        return documents.map((doc) {
          final String name = doc['name'] ?? '';
          final dateStr = name.split('/').last;
          final fields = doc['fields'] as Map<String, dynamic>? ?? {};

          final kwh = _parseDouble(fields['kwh']);
          final peakKw = _parseDouble(fields['peakKw']);
          final cost = _parseDouble(fields['cost']);

          return {
            'date': dateStr,
            'kwh': kwh,
            'peakKw': peakKw,
            'cost': cost,
          };
        }).toList()
          ..sort((a, b) => (a['date'] as String).compareTo(b['date'] as String));
      }
    } catch (e) {
      debugPrint('Firestore fetchEnergyHistory error: $e');
    }
    return [];
  }

  /// Fetches single day power document from energyHistory collection
  static Future<Map<String, dynamic>?> fetchDayPowerStats(String date, {String? userId}) async {
    String targetUid = userId?.trim() ?? '';
    if (targetUid.isEmpty) {
      targetUid = await _discoverUserUid();
    }
    if (targetUid.isEmpty) return null;

    final url = Uri.parse('$baseUrl/$targetUid/energyHistory/$date');
    try {
      final response = await http.get(url);
      if (response.statusCode == 200) {
        final Map<String, dynamic> doc = json.decode(response.body);
        final fields = doc['fields'] as Map<String, dynamic>? ?? {};
        final kwh = _parseDouble(fields['kwh']);
        final peakKw = _parseDouble(fields['peakKw']);
        final cost = _parseDouble(fields['cost']);

        return {
          'kwh': kwh,
          'peakKw': peakKw,
          'cost': cost,
        };
      }
    } catch (e) {
      debugPrint('Firestore fetchDayPowerStats error: $e');
    }
    return null;
  }

  /// Fetches daily climate records from Firestore climateHistory collection
  static Future<List<Map<String, dynamic>>> fetchClimateHistory({String? userId}) async {
    String targetUid = userId?.trim() ?? '';
    if (targetUid.isEmpty) {
      targetUid = await _discoverUserUid();
    }
    if (targetUid.isEmpty) return [];

    final url = Uri.parse('$baseUrl/$targetUid/climateHistory');

    try {
      final response = await http.get(url);
      if (response.statusCode == 200) {
        final Map<String, dynamic> data = json.decode(response.body);
        final documents = data['documents'] as List<dynamic>? ?? [];

        return documents.map((doc) {
          final String name = doc['name'] ?? '';
          final dateStr = name.split('/').last;
          return {
            'date': dateStr,
            'raw': doc['fields'],
          };
        }).toList()
          ..sort((a, b) => (a['date'] as String).compareTo(b['date'] as String));
      }
    } catch (e) {
      debugPrint('Firestore fetchClimateHistory error: $e');
    }
    return [];
  }

  /// Fetches single day climate document from climateHistory collection
  static Future<Map<String, dynamic>?> fetchDayClimateStats(String date, {String? userId}) async {
    String targetUid = userId?.trim() ?? '';
    if (targetUid.isEmpty) {
      targetUid = await _discoverUserUid();
    }
    if (targetUid.isEmpty) return null;

    final url = Uri.parse('$baseUrl/$targetUid/climateHistory/$date');
    try {
      final response = await http.get(url);
      if (response.statusCode == 200) {
        final Map<String, dynamic> doc = json.decode(response.body);
        return doc['fields'] as Map<String, dynamic>?;
      }
    } catch (e) {
      debugPrint('Firestore fetchDayClimateStats error: $e');
    }
    return null;
  }

  static Future<String> _discoverUserUid() async {
    final rootUrl = Uri.parse(baseUrl);
    try {
      final response = await http.get(rootUrl);
      if (response.statusCode == 200) {
        final Map<String, dynamic> data = json.decode(response.body);
        final documents = data['documents'] as List<dynamic>? ?? [];
        if (documents.isNotEmpty) {
          final String firstName = documents.first['name'] ?? '';
          final uid = firstName.split('/').last;
          return uid;
        }
      }
    } catch (e) {
      debugPrint('Firestore discovery error: $e');
    }
    return '';
  }

  static double _parseDouble(dynamic fieldVal) {
    if (fieldVal == null) return 0.0;
    if (fieldVal['doubleValue'] != null) {
      return (fieldVal['doubleValue'] as num).toDouble();
    }
    if (fieldVal['integerValue'] != null) {
      return (fieldVal['integerValue'] as num).toDouble();
    }
    if (fieldVal['stringValue'] != null) {
      return double.tryParse(fieldVal['stringValue'].toString()) ?? 0.0;
    }
    return 0.0;
  }
}
