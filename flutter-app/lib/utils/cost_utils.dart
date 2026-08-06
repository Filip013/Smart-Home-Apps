/// RSD cost/tariff helpers shared by the dashboard and Power & Climate tab.
///
/// Mirrors React's Dashboard.calculateDailyCostRSD: high/low tariff —
/// 4.15 RSD/kWh 00–08h, 13.45 RSD/kWh 08–24h; flat 10.66 RSD/kWh when no
/// hourly data is available.
double calculateDailyCostRsd(double kwh, [List<double>? hourly]) {
  if (hourly != null && hourly.length == 24) {
    double cost = 0;
    for (var i = 0; i < 24; i++) {
      cost += hourly[i] * (i < 8 ? 4.15 : 13.45);
    }
    return cost;
  }
  return kwh * 10.66;
}

/// This calendar month's prefix (YYYY-MM) — monthly figures must never span
/// the last 30 days (which leaks the previous month).
String currentMonthPrefix() {
  final now = DateTime.now();
  return '${now.year}-${now.month.toString().padLeft(2, '0')}';
}

/// energyHistory docs for the current calendar month.
List<Map<String, dynamic>> currentMonthHistory(List<Map<String, dynamic>> energyHistory) {
  final prefix = currentMonthPrefix();
  return energyHistory
      .where((e) => (e['date'] as String? ?? '').startsWith(prefix))
      .toList();
}

/// Sum of kWh over this month's history docs.
double sumMonthlyKwh(List<Map<String, dynamic>> monthHistory) {
  return monthHistory
      .map((e) => (e['kwh'] as num?)?.toDouble() ?? 0.0)
      .fold(0.0, (a, b) => a + b);
}

/// Sum of daily costs (high/low tariff) over this month's history docs.
double sumMonthlyCostRsd(List<Map<String, dynamic>> monthHistory) {
  return monthHistory
      .map((e) => calculateDailyCostRsd(
            (e['kwh'] as num?)?.toDouble() ?? 0.0,
            (e['hourly'] as List<dynamic>?)
                    ?.whereType<num>()
                    .map((v) => v.toDouble())
                    .toList() ??
                const [],
          ))
      .fold(0.0, (a, b) => a + b);
}
