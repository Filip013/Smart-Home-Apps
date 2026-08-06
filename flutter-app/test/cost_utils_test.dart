import 'package:flutter_test/flutter_test.dart';
import 'package:smart_home_flutter/utils/cost_utils.dart';

void main() {
  group('calculateDailyCostRsd', () {
    test('flat 10.66 RSD/kWh without hourly data', () {
      expect(calculateDailyCostRsd(10.0), closeTo(106.6, 0.001));
    });

    test('high/low tariff with 24 hourly points', () {
      // 1 kWh every hour: 8h x 4.15 + 16h x 13.45 = 33.2 + 215.2
      final hourly = List<double>.filled(24, 1.0);
      expect(calculateDailyCostRsd(10.0, hourly), closeTo(248.4, 0.001));
    });

    test('partial hourly list falls back to flat rate', () {
      expect(calculateDailyCostRsd(2.0, [1.0, 2.0]), closeTo(21.32, 0.001));
    });
  });

  group('current month helpers', () {
    final prefix = currentMonthPrefix();
    final inMonth = '$prefix-01';
    final prevMonth = '${prefix.substring(0, 7) == prefix ? _prevMonth(prefix) : prefix}-28';

    final history = [
      {'date': inMonth, 'kwh': 2.0},
      {'date': '$prefix-02', 'kwh': 3.5},
      {'date': prevMonth, 'kwh': 99.0},
      {'date': '2025-01-15', 'kwh': 77.0},
    ];

    test('currentMonthHistory keeps only this calendar month', () {
      final filtered = currentMonthHistory(history);
      expect(filtered.length, 2);
      expect(filtered.every((e) => (e['date'] as String).startsWith(prefix)), isTrue);
    });

    test('sumMonthlyKwh sums only the month docs passed in', () {
      expect(sumMonthlyKwh(currentMonthHistory(history)), closeTo(5.5, 0.001));
    });

    test('sumMonthlyCostRsd applies per-day tariff', () {
      final cost = sumMonthlyCostRsd(currentMonthHistory(history));
      // 2.0 * 10.66 + 3.5 * 10.66 (no hourly in docs)
      expect(cost, closeTo(5.5 * 10.66, 0.001));
    });
  });
}

String _prevMonth(String prefix) {
  final parts = prefix.split('-');
  final year = int.parse(parts[0]);
  final month = int.parse(parts[1]);
  final prev = month == 1 ? DateTime(year - 1, 12) : DateTime(year, month - 1);
  return '${prev.year}-${prev.month.toString().padLeft(2, '0')}';
}
