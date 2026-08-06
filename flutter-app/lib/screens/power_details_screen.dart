import 'package:fl_chart/fl_chart.dart';
import 'package:flutter/material.dart';
import 'package:flutter_lucide/flutter_lucide.dart';
import 'package:google_fonts/google_fonts.dart';
import 'package:provider/provider.dart';

import '../models/device_state.dart';
import '../providers/home_provider.dart';
import '../providers/theme_provider.dart';
import '../services/auth_service.dart';
import '../services/firestore_service.dart';
import '../utils/cost_utils.dart';

class PowerDetailsScreen extends StatefulWidget {
  const PowerDetailsScreen({super.key});

  @override
  State<PowerDetailsScreen> createState() => _PowerDetailsScreenState();
}

class _PowerDetailsScreenState extends State<PowerDetailsScreen> {
  String _timeRange = '24h'; // '24h' | '30d'
  String _selectedSensorKey = 'sensor1'; // 'sensor1' | 'sensor2'
  String _climateMetric = 'temp'; // 'temp' | 'humidity'
  DateTime _selectedDate = DateTime.now();
  final String _selectedMonth =
      '${DateTime.now().year}-${DateTime.now().month.toString().padLeft(2, '0')}';

  List<Map<String, dynamic>> _firestoreEnergyHistory = [];
  Map<String, dynamic>? _historicalClimateDay;

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addPostFrameCallback((_) {
      _loadFirestoreData();
    });
  }

  Future<void> _loadFirestoreData() async {
    final authService = Provider.of<AuthService>(context, listen: false);
    final provider = Provider.of<HomeProvider>(context, listen: false);
    final userUid = authService.userUid ?? provider.settingsService?.firestoreUserId;
    final idToken = await authService.getIdToken();

    final energy =
        await FirestoreService.fetchEnergyHistory(userId: userUid, idToken: idToken);

    final dateStr =
        '${_selectedDate.year}-${_selectedDate.month.toString().padLeft(2, '0')}-${_selectedDate.day.toString().padLeft(2, '0')}';
    final todayStr =
        '${DateTime.now().year}-${DateTime.now().month.toString().padLeft(2, '0')}-${DateTime.now().day.toString().padLeft(2, '0')}';

    Map<String, dynamic>? climateDay;
    if (dateStr != todayStr) {
      climateDay =
          await FirestoreService.fetchDayClimateStats(dateStr, userId: userUid, idToken: idToken);
    }

    if (mounted) {
      setState(() {
        _firestoreEnergyHistory = energy;
        _historicalClimateDay = climateDay;
      });
    }
  }

  /// Mirrors React Dashboard.calculateDailyCostRSD (see utils/cost_utils.dart).
  double _calculateDailyCostRsd(double kwh, [List<double>? hourly]) =>
      calculateDailyCostRsd(kwh, hourly);

  @override
  Widget build(BuildContext context) {
    final isDark = Provider.of<ThemeProvider>(context).isDarkMode;
    final dateStr =
        '${_selectedDate.year}-${_selectedDate.month.toString().padLeft(2, '0')}-${_selectedDate.day.toString().padLeft(2, '0')}';
    final todayStr =
        '${DateTime.now().year}-${DateTime.now().month.toString().padLeft(2, '0')}-${DateTime.now().day.toString().padLeft(2, '0')}';
    final isToday = dateStr == todayStr;

    return Scaffold(
      backgroundColor: isDark ? const Color(0xFF0B0F19) : const Color(0xFFF8FAFC),
      body: Consumer<HomeProvider>(
        builder: (context, provider, child) {
          final power = provider.status?.power;
          final devices = provider.status?.devices ?? [];

          final watts = power?.currentLoadWatts ?? 308.5;
          final todayKwh = provider.accumulatedKwh > 0 ? provider.accumulatedKwh : 0.83;
          final todayCostRsd = _calculateDailyCostRsd(todayKwh);
          final co2Kg = todayKwh * 0.385;

          // This calendar month only — real history, no projection fallback
          // (the app tracks real monthly changes; without Firestore history
          // the monthly figures stay empty instead of showing an estimate).
          final monthHistory = currentMonthHistory(_firestoreEnergyHistory);
          final double monthlyKwh = sumMonthlyKwh(monthHistory);
          final double monthlyCostRsd = sumMonthlyCostRsd(monthHistory);

          // Real peaks — mirror React's peakLoad24h (max of today's hourly
          // history, W) and selectedMonthPeakKw (max of this month's
          // energyHistory peakKw). Never the current load.
          final double hourlyPeakW = (power?.hourlyHistory ?? const [])
              .map((h) => (h['loadWatts'] as num?)?.toDouble() ?? 0.0)
              .fold<double>(0.0, (m, w) => w > m ? w : m);
          final double monthPeakKw = monthHistory
              .map((e) => (e['peakKw'] as num?)?.toDouble() ?? 0.0)
              .fold<double>(0.0, (m, p) => p > m ? p : m);

          // Monthly bar chart: this calendar month's real days only.
          final barGroups30d = monthHistory.asMap().entries.map((e) {
            final idx = e.key;
            final kwh = (e.value['kwh'] as num?)?.toDouble() ?? 0.0;
            return BarChartGroupData(
              x: idx,
              barRods: [
                BarChartRodData(
                  toY: kwh,
                  color: const Color(0xFF3B82F6),
                  width: 12,
                  borderRadius: BorderRadius.circular(4),
                )
              ],
            );
          }).toList();

          final powerSpots = provider.power24hWave.asMap().entries.map((e) {
            return FlSpot(e.key.toDouble(), e.value);
          }).toList();

          final double minPowerY = (provider.power24hWave.reduce((a, b) => a < b ? a : b) - 20.0).clamp(0.0, 10000.0);
          final double maxPowerY = provider.power24hWave.reduce((a, b) => a > b ? a : b) + 20.0;

          SensorDevice? dev1;
          SensorDevice? dev2;

          for (var d in devices) {
            if (d.id.contains('bf8b') || d.name.toLowerCase().contains('belgrade')) {
              dev1 = d;
            } else if (d.id.contains('bf20') || d.name.toLowerCase().contains('vršac') || d.name.toLowerCase().contains('vrsac')) {
              dev2 = d;
            }
          }
          dev1 ??= devices.isNotEmpty ? devices[0] : null;
          dev2 ??= devices.length > 1 ? devices[1] : null;

          final activeSensor = _selectedSensorKey == 'sensor1' ? dev1 : dev2;
          final activeId = activeSensor?.id ?? (_selectedSensorKey == 'sensor1' ? 'bf8b4017359259c5b2jnfn' : 'bf20f914e6de81daa9ylvi');
          final activeTemp = (activeSensor?.temperature != null && activeSensor!.temperature! > 0)
              ? activeSensor.temperature!
              : (_selectedSensorKey == 'sensor1' ? 25.1 : 26.3);
          final activeHum = (activeSensor?.humidity != null && activeSensor!.humidity! > 0)
              ? activeSensor.humidity!
              : (_selectedSensorKey == 'sensor1' ? 55 : 48);
          final sensorName = activeSensor?.name ?? (_selectedSensorKey == 'sensor1' ? 'Belgrade Sensor' : 'Vršac Sensor');

          List<double> climateWave = [];
          if (isToday) {
            final wave = _climateMetric == 'temp'
                ? provider.sensorTempWaves[activeId]
                : provider.sensorHumidWaves[activeId];

            climateWave = (wave != null && wave.isNotEmpty)
                ? wave
                : (_climateMetric == 'temp'
                    ? HomeProvider.generate24HourTempWave(activeTemp)
                    : HomeProvider.generate24HourHumidWave(activeHum));
          } else {
            if (_historicalClimateDay != null) {
              final sensorDoc = _historicalClimateDay?[_selectedSensorKey] as Map<String, dynamic>?;
              final hourlyList = sensorDoc?['hourly'] as List<dynamic>? ?? [];
              climateWave = hourlyList.map((item) {
                final double val = _climateMetric == 'temp'
                    ? ((item['temp'] as num?)?.toDouble() ?? activeTemp)
                    : ((item['humidity'] as num?)?.toDouble() ?? activeHum.toDouble());
                return val > 0 ? val : (_climateMetric == 'temp' ? activeTemp : activeHum.toDouble());
              }).toList();
            }
            if (climateWave.isEmpty) {
              climateWave = _climateMetric == 'temp'
                  ? HomeProvider.generate24HourTempWave(activeTemp)
                  : HomeProvider.generate24HourHumidWave(activeHum);
            }
          }

          final validValues = climateWave.where((v) => v > 0.0).toList();
          final double avgVal = validValues.isNotEmpty
              ? double.parse((validValues.reduce((a, b) => a + b) / validValues.length).toStringAsFixed(1))
              : (_climateMetric == 'temp' ? activeTemp : activeHum.toDouble());
          final double minVal = validValues.isNotEmpty
              ? validValues.reduce((a, b) => a < b ? a : b)
              : (_climateMetric == 'temp' ? activeTemp - 0.7 : activeHum - 5.0);
          final double maxVal = validValues.isNotEmpty
              ? validValues.reduce((a, b) => a > b ? a : b)
              : (_climateMetric == 'temp' ? activeTemp + 1.2 : activeHum + 4.0);

          final double minClimateY = (minVal - 2.0).clamp(0.0, 100.0);
          final double maxClimateY = maxVal + 2.0;

          final climateSpots = climateWave.asMap().entries.map((e) {
            return FlSpot(e.key.toDouble(), e.value);
          }).toList();

          return SingleChildScrollView(
            padding: const EdgeInsets.all(24),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                _buildPageHeader(context, dateStr, isDark),
                const SizedBox(height: 24),

                Row(
                  children: [
                    Expanded(
                      child: _buildKpiCard(
                        title: _timeRange == '24h' ? 'Today\'s Peak Load' : 'Peak Power (Month)',
                        value: _timeRange == '24h'
                            ? '${hourlyPeakW.toStringAsFixed(0)} W'
                            : '${monthPeakKw.toStringAsFixed(2)} kW',
                        footer: _timeRange == '24h' ? 'Peak load recorded today' : 'Highest demand in month',
                        icon: LucideIcons.zap,
                        color: const Color(0xFF00E5FF),
                        isDark: isDark,
                      ),
                    ),
                    const SizedBox(width: 16),

                    Expanded(
                      child: _buildKpiCard(
                        title: _timeRange == '24h' ? 'Today\'s Usage' : 'Avg Daily Energy',
                        value: '${todayKwh.toStringAsFixed(2)} kWh',
                        footer: 'CO₂ Footprint: ${co2Kg.toStringAsFixed(2)} kg',
                        icon: LucideIcons.trending_up,
                        color: const Color(0xFF10B981),
                        isDark: isDark,
                      ),
                    ),
                    const SizedBox(width: 16),

                    Expanded(
                      child: _buildKpiCard(
                        title: 'Energy Total (Month)',
                        value: monthlyKwh > 0 ? '${monthlyKwh.toStringAsFixed(1)} kWh' : '—',
                        footer: 'This calendar month',
                        icon: LucideIcons.calendar,
                        color: const Color(0xFF6366F1),
                        isDark: isDark,
                      ),
                    ),
                    const SizedBox(width: 16),

                    Expanded(
                      child: _buildKpiCard(
                        title: _timeRange == '24h' ? 'Today\'s Cost' : 'Cost (Month)',
                        value: _timeRange == '24h'
                            ? '${todayCostRsd.toStringAsFixed(0)} RSD'
                            : (monthlyCostRsd > 0 ? '${monthlyCostRsd.toStringAsFixed(0)} RSD' : '—'),
                        footer: 'Calculated using High/Low Tariff',
                        icon: LucideIcons.dollar_sign,
                        color: const Color(0xFFF59E0B),
                        isDark: isDark,
                      ),
                    ),
                  ],
                ),
                const SizedBox(height: 24),

                Container(
                  padding: const EdgeInsets.all(24),
                  decoration: BoxDecoration(
                    color: isDark ? const Color(0xFF131B2E) : Colors.white,
                    borderRadius: BorderRadius.circular(20),
                    border: Border.all(color: isDark ? Colors.white.withValues(alpha: 0.08) : Colors.black12),
                  ),
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Row(
                        mainAxisAlignment: MainAxisAlignment.spaceBetween,
                        children: [
                          Row(
                            children: [
                              const Icon(LucideIcons.activity, color: Color(0xFF00E5FF), size: 20),
                              const SizedBox(width: 10),
                              Text(
                                _timeRange == '24h'
                                    ? '24-Hour Load Profile (Watts)'
                                    : 'Monthly Power Consumption ($_selectedMonth)',
                                style: GoogleFonts.outfit(
                                  fontSize: 18,
                                  fontWeight: FontWeight.bold,
                                  color: isDark ? Colors.white : const Color(0xFF0F172A),
                                ),
                              ),
                            ],
                          ),
                          Text(
                            '${watts.toStringAsFixed(1)} W',
                            style: GoogleFonts.outfit(fontSize: 22, fontWeight: FontWeight.bold, color: const Color(0xFF00E5FF)),
                          ),
                        ],
                      ),
                      const SizedBox(height: 24),

                      SizedBox(
                        height: 250,
                        child: _timeRange == '24h'
                            ? LineChart(
                                LineChartData(
                                  minY: minPowerY,
                                  maxY: maxPowerY,
                                  gridData: FlGridData(
                                    show: true,
                                    drawVerticalLine: false,
                                    getDrawingHorizontalLine: (val) => FlLine(color: isDark ? Colors.white10 : Colors.black12, strokeWidth: 1),
                                  ),
                                  titlesData: const FlTitlesData(
                                    leftTitles: AxisTitles(sideTitles: SideTitles(showTitles: true, reservedSize: 44)),
                                    bottomTitles: AxisTitles(sideTitles: SideTitles(showTitles: false)),
                                    topTitles: AxisTitles(sideTitles: SideTitles(showTitles: false)),
                                    rightTitles: AxisTitles(sideTitles: SideTitles(showTitles: false)),
                                  ),
                                  borderData: FlBorderData(show: false),
                                  lineBarsData: [
                                    LineChartBarData(
                                      spots: powerSpots,
                                      isCurved: true,
                                      preventCurveOverShooting: true,
                                      color: const Color(0xFF00E5FF),
                                      barWidth: 3,
                                      isStrokeCapRound: true,
                                      dotData: const FlDotData(show: false),
                                      belowBarData: BarAreaData(show: true, color: const Color(0xFF00E5FF).withValues(alpha: 0.15)),
                                    ),
                                  ],
                                ),
                              )
                            : (barGroups30d.isEmpty
                                ? Center(
                                    child: Text(
                                      'No energy history recorded for $_selectedMonth yet.',
                                      style: GoogleFonts.inter(
                                        fontSize: 13,
                                        color: isDark ? Colors.white54 : Colors.black54,
                                      ),
                                    ),
                                  )
                                : BarChart(
                                BarChartData(
                                  gridData: const FlGridData(show: false),
                                  borderData: FlBorderData(show: false),
                                  titlesData: const FlTitlesData(
                                    leftTitles: AxisTitles(sideTitles: SideTitles(showTitles: true, reservedSize: 40)),
                                    bottomTitles: AxisTitles(sideTitles: SideTitles(showTitles: false)),
                                    topTitles: AxisTitles(sideTitles: SideTitles(showTitles: false)),
                                    rightTitles: AxisTitles(sideTitles: SideTitles(showTitles: false)),
                                  ),
                                  barGroups: barGroups30d,
                                ),
                              )),
                      ),
                      const SizedBox(height: 16),

                      Container(
                        padding: const EdgeInsets.all(16),
                        decoration: BoxDecoration(
                          color: isDark ? const Color(0xFF1E2942) : Colors.grey.withValues(alpha: 0.1),
                          borderRadius: BorderRadius.circular(12),
                        ),
                        child: Row(
                          mainAxisAlignment: MainAxisAlignment.spaceAround,
                          children: [
                            _buildSummaryStatItem('Peak Demand', _timeRange == '24h' ? '${(hourlyPeakW / 1000.0).toStringAsFixed(2)} kW' : '${monthPeakKw.toStringAsFixed(2)} kW', Colors.redAccent),
                            _buildSummaryStatItem('Average Load', '${watts.toStringAsFixed(0)} W', isDark ? Colors.white : Colors.black),
                            _buildSummaryStatItem('Estimated Cost', _timeRange == '24h' ? '${todayCostRsd.toStringAsFixed(1)} RSD' : (monthlyCostRsd > 0 ? '${monthlyCostRsd.toStringAsFixed(1)} RSD' : '—'), Colors.amberAccent),
                          ],
                        ),
                      ),
                    ],
                  ),
                ),
                const SizedBox(height: 24),

                Container(
                  padding: const EdgeInsets.all(24),
                  decoration: BoxDecoration(
                    color: isDark ? const Color(0xFF131B2E) : Colors.white,
                    borderRadius: BorderRadius.circular(20),
                    border: Border.all(color: isDark ? Colors.white.withValues(alpha: 0.08) : Colors.black12),
                  ),
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Row(
                        mainAxisAlignment: MainAxisAlignment.spaceBetween,
                        children: [
                          Row(
                            children: [
                              const Icon(LucideIcons.thermometer, color: Color(0xFF818CF8), size: 20),
                              const SizedBox(width: 10),
                              Text(
                                'Climate Profile: $sensorName',
                                style: GoogleFonts.outfit(fontSize: 18, fontWeight: FontWeight.bold),
                              ),
                            ],
                          ),

                          Row(
                            children: [
                              DropdownButton<String>(
                                value: _selectedSensorKey,
                                dropdownColor: isDark ? const Color(0xFF131B2E) : Colors.white,
                                items: const [
                                  DropdownMenuItem(value: 'sensor1', child: Text('Belgrade Sensor')),
                                  DropdownMenuItem(value: 'sensor2', child: Text('Vršac Sensor')),
                                ],
                                onChanged: (val) {
                                  if (val != null) setState(() => _selectedSensorKey = val);
                                },
                              ),
                              const SizedBox(width: 12),

                              SegmentedButton<String>(
                                segments: const [
                                  ButtonSegment(value: 'temp', label: Text('Temp (°C)')),
                                  ButtonSegment(value: 'humidity', label: Text('Humidity (%)')),
                                ],
                                selected: {_climateMetric},
                                onSelectionChanged: (set) => setState(() => _climateMetric = set.first),
                              ),
                            ],
                          ),
                        ],
                      ),
                      const SizedBox(height: 20),

                      SizedBox(
                        height: 220,
                        child: LineChart(
                          LineChartData(
                            minY: minClimateY,
                            maxY: maxClimateY,
                            gridData: const FlGridData(show: false),
                            titlesData: const FlTitlesData(
                              leftTitles: AxisTitles(sideTitles: SideTitles(showTitles: true, reservedSize: 40)),
                              bottomTitles: AxisTitles(sideTitles: SideTitles(showTitles: false)),
                              topTitles: AxisTitles(sideTitles: SideTitles(showTitles: false)),
                              rightTitles: AxisTitles(sideTitles: SideTitles(showTitles: false)),
                            ),
                            borderData: FlBorderData(show: false),
                            lineBarsData: [
                              LineChartBarData(
                                spots: climateSpots,
                                isCurved: true,
                                color: _climateMetric == 'temp' ? const Color(0xFF818CF8) : const Color(0xFF34D399),
                                barWidth: 3,
                                belowBarData: BarAreaData(
                                  show: true,
                                  color: (_climateMetric == 'temp' ? const Color(0xFF818CF8) : const Color(0xFF34D399)).withValues(alpha: 0.15),
                                ),
                              ),
                            ],
                          ),
                        ),
                      ),
                      const SizedBox(height: 16),

                      Container(
                        padding: const EdgeInsets.all(16),
                        decoration: BoxDecoration(
                          color: isDark ? const Color(0xFF1E2942) : Colors.grey.withValues(alpha: 0.1),
                          borderRadius: BorderRadius.circular(12),
                        ),
                        child: Row(
                          mainAxisAlignment: MainAxisAlignment.spaceAround,
                          children: [
                            _buildSummaryStatItem(
                              _climateMetric == 'temp' ? 'Average Temp' : 'Average Humidity',
                              _climateMetric == 'temp' ? '${avgVal.toStringAsFixed(1)}°C' : '${avgVal.round()}%',
                              isDark ? Colors.white : Colors.black,
                            ),
                            _buildSummaryStatItem(
                              'Minimum',
                              _climateMetric == 'temp' ? '${minVal.toStringAsFixed(1)}°C' : '${minVal.round()}%',
                              const Color(0xFF34D399),
                            ),
                            _buildSummaryStatItem(
                              'Maximum',
                              _climateMetric == 'temp' ? '${maxVal.toStringAsFixed(1)}°C' : '${maxVal.round()}%',
                              Colors.redAccent,
                            ),
                          ],
                        ),
                      ),
                    ],
                  ),
                ),
              ],
            ),
          );
        },
      ),
    );
  }

  Widget _buildPageHeader(BuildContext context, String dateStr, bool isDark) {
    return Row(
      mainAxisAlignment: MainAxisAlignment.spaceBetween,
      children: [
        Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text('Power & Climate Analytics', style: GoogleFonts.outfit(fontSize: 24, fontWeight: FontWeight.bold)),
            Text('Detailed insight into your grid connection, energy consumption, and environmental climate history.', style: GoogleFonts.inter(fontSize: 13, color: Colors.grey)),
          ],
        ),
        Row(
          children: [
            if (_timeRange == '24h')
              InkWell(
                onTap: () async {
                  final picked = await showDatePicker(
                    context: context,
                    initialDate: _selectedDate,
                    firstDate: DateTime(2025),
                    lastDate: DateTime.now(),
                  );
                  if (picked != null) {
                    setState(() => _selectedDate = picked);
                    _loadFirestoreData();
                  }
                },
                borderRadius: BorderRadius.circular(12),
                child: Container(
                  padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 8),
                  decoration: BoxDecoration(
                    color: isDark ? const Color(0xFF131B2E) : Colors.white,
                    borderRadius: BorderRadius.circular(10),
                    border: Border.all(color: isDark ? Colors.white.withValues(alpha: 0.1) : Colors.black12),
                  ),
                  child: Row(
                    children: [
                      const Icon(LucideIcons.calendar, size: 16, color: Colors.blueAccent),
                      const SizedBox(width: 8),
                      Text(dateStr, style: GoogleFonts.firaCode(fontSize: 13, fontWeight: FontWeight.bold)),
                    ],
                  ),
                ),
              ),

            const SizedBox(width: 12),
            SegmentedButton<String>(
              segments: const [
                ButtonSegment(value: '24h', label: Text('Daily Profile')),
                ButtonSegment(value: '30d', label: Text('Monthly History')),
              ],
              selected: {_timeRange},
              onSelectionChanged: (set) => setState(() => _timeRange = set.first),
            ),
          ],
        ),
      ],
    );
  }

  Widget _buildKpiCard({
    required String title,
    required String value,
    required String footer,
    required IconData icon,
    required Color color,
    required bool isDark,
  }) {
    return Container(
      padding: const EdgeInsets.all(18),
      decoration: BoxDecoration(
        color: isDark ? const Color(0xFF131B2E) : Colors.white,
        borderRadius: BorderRadius.circular(16),
        border: Border.all(color: color.withValues(alpha: 0.2)),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              Icon(icon, color: color, size: 20),
              const SizedBox(width: 8),
              Expanded(child: Text(title, style: GoogleFonts.inter(fontSize: 12, color: Colors.grey), overflow: TextOverflow.ellipsis)),
            ],
          ),
          const SizedBox(height: 10),
          Text(value, style: GoogleFonts.outfit(fontSize: 22, fontWeight: FontWeight.bold)),
          const SizedBox(height: 4),
          Text(footer, style: GoogleFonts.inter(fontSize: 11, color: Colors.grey)),
        ],
      ),
    );
  }

  Widget _buildSummaryStatItem(String label, String value, Color valColor) {
    return Column(
      children: [
        Text(label, style: GoogleFonts.inter(fontSize: 11, color: Colors.grey)),
        const SizedBox(height: 2),
        Text(value, style: GoogleFonts.outfit(fontSize: 16, fontWeight: FontWeight.bold, color: valColor)),
      ],
    );
  }
}
