import 'dart:convert';
import 'package:flutter/material.dart';
import 'package:flutter_lucide/flutter_lucide.dart';
import 'package:google_fonts/google_fonts.dart';
import 'package:pdf/pdf.dart';
import 'package:pdf/widgets.dart' as pw;
import 'package:printing/printing.dart';
import 'package:provider/provider.dart';

import '../providers/home_provider.dart';
import '../providers/theme_provider.dart';
import '../services/auth_service.dart';
import '../services/firestore_service.dart';
import '../utils/cost_utils.dart';

class ExportReportScreen extends StatefulWidget {
  const ExportReportScreen({super.key});

  @override
  State<ExportReportScreen> createState() => _ExportReportScreenState();
}

class _ExportReportScreenState extends State<ExportReportScreen> {
  String _month = currentMonthPrefix();
  String _sensorKey = 'sensor1';
  List<Map<String, dynamic>> _energyHistory = [];
  List<Map<String, dynamic>> _climateHistory = [];
  bool _loading = true;
  bool _signedIn = false;

  List<String> get _months {
    final months = <String>{_month};
    for (final e in _energyHistory) {
      final d = (e['date'] as String? ?? '');
      if (d.length >= 7) months.add(d.substring(0, 7));
    }
    return months.toList()..sort((a, b) => b.compareTo(a));
  }

  List<Map<String, dynamic>> get _monthEnergy => _energyHistory
      .where((e) => (e['date'] as String? ?? '').startsWith(_month))
      .toList();

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addPostFrameCallback((_) => _loadHistory());
  }

  Future<void> _loadHistory() async {
    final authService = Provider.of<AuthService>(context, listen: false);
    final provider = Provider.of<HomeProvider>(context, listen: false);
    final uid = authService.userUid ?? provider.settingsService?.firestoreUserId;
    final idToken = await authService.getIdToken();
    if (uid == null || uid.isEmpty || idToken == null || idToken.isEmpty) {
      if (mounted) setState(() => _loading = false);
      return;
    }

    final energy = await FirestoreService.fetchEnergyHistory(userId: uid, idToken: idToken);
    final climate = await FirestoreService.fetchClimateHistory(userId: uid, idToken: idToken);
    if (mounted) {
      setState(() {
        _energyHistory = energy;
        _climateHistory = climate;
        _signedIn = true;
        _loading = false;
        // Default to whichever sensor actually has climate data recorded.
        if (!_sensorHasData('sensor1') && _sensorHasData('sensor2')) {
          _sensorKey = 'sensor2';
        }
      });
    }
  }

  bool _sensorHasData(String key) => _climateHistory.any((c) {
        final sensors = (c['sensors'] as Map<String, dynamic>?) ?? const {};
        final s = (sensors[key] as Map<String, dynamic>?) ?? const {};
        return s['avgTemp'] is num;
      });

  Map<String, dynamic>? _find(List<Map<String, dynamic>> list, String date) {
    for (final e in list) {
      if (e['date'] == date) return e;
    }
    return null;
  }

  /// Merged day rows for the selected month — mirrors React's ExportPrint
  /// reportTableData (energy kWh/cost + per-sensor climate averages).
  List<Map<String, dynamic>> _reportRows(String monthPrefix) {
    final days = <String>{};
    for (final e in _energyHistory) {
      final d = e['date'] as String? ?? '';
      if (d.startsWith(monthPrefix)) days.add(d);
    }
    for (final c in _climateHistory) {
      final d = c['date'] as String? ?? '';
      if (d.startsWith(monthPrefix)) days.add(d);
    }

    final sorted = days.toList()..sort();
    return sorted.map((date) {
      final p = _find(_energyHistory, date);
      final c = _find(_climateHistory, date);
      final sensors = (c?['sensors'] as Map<String, dynamic>?) ?? const {};
      final s = (sensors[_sensorKey] as Map<String, dynamic>?) ?? const {};

      final kwh = p?['kwh'] as num?;
      final hourly = (p?['hourly'] as List<dynamic>?)
          ?.whereType<num>()
          .map((v) => v.toDouble())
          .toList();

      return {
        'date': date,
        'kwh': kwh,
        'cost': kwh != null ? calculateDailyCostRsd(kwh.toDouble(), hourly) : null,
        'temp': s['avgTemp'] as num?,
        'humidity': s['avgHumidity'] as num?,
      };
    }).toList();
  }

  static String _num(num? v, int dp) => v != null ? v.toStringAsFixed(dp) : 'N/A';

  static String _csvCell(String v) => '"${v.replaceAll('"', '""')}"';

  String _csvFor(List<Map<String, dynamic>> rows) {
    final lines = <String>[
      'Date,Energy Consumed (kWh),Est Cost (RSD),Average Temp (°C),Average Humidity (%)',
    ];
    for (final r in rows) {
      lines.add([
        _csvCell(r['date'] as String),
        _csvCell(_num(r['kwh'] as num?, 2)),
        _csvCell(_num(r['cost'] as num?, 2)),
        _csvCell(_num(r['temp'] as num?, 1)),
        _csvCell(_num(r['humidity'] as num?, 0)),
      ].join(','));
    }
    return lines.join('\n');
  }

  /// Prints the monthly report via the OS print dialog (Windows/web) or the
  /// share/save sheet on mobile — mirrors React's printable sheet.
  Future<void> _printReport(List<Map<String, dynamic>> rows) async {
    final monthKwh = sumMonthlyKwh(_monthEnergy);
    final monthCost = sumMonthlyCostRsd(_monthEnergy);

    final kwhValues = [
      for (final r in rows)
        if (r['kwh'] is num) (r['kwh'] as num).toDouble(),
    ];
    final tempValues = [
      for (final r in rows)
        if (r['temp'] is num) (r['temp'] as num).toDouble(),
    ];
    var maxKwh = kwhValues.isEmpty ? 1.0 : kwhValues.reduce((a, b) => a > b ? a : b);
    if (maxKwh <= 0) maxKwh = 1.0;
    var minTemp = tempValues.isEmpty ? 0.0 : tempValues.reduce((a, b) => a < b ? a : b);
    var maxTemp = tempValues.isEmpty ? 1.0 : tempValues.reduce((a, b) => a > b ? a : b);
    if (maxTemp - minTemp < 1) maxTemp = minTemp + 1;

    pw.Widget metric(String label, String value) => pw.Expanded(
          child: pw.Container(
            padding: const pw.EdgeInsets.all(12),
            decoration: pw.BoxDecoration(
              border: pw.Border.all(color: PdfColors.grey400),
              borderRadius: pw.BorderRadius.circular(4),
            ),
            child: pw.Column(
              crossAxisAlignment: pw.CrossAxisAlignment.start,
              children: [
                pw.Text(label.toUpperCase(),
                    style: pw.TextStyle(fontSize: 8, color: PdfColors.grey700)),
                pw.SizedBox(height: 4),
                pw.Text(value,
                    style: pw.TextStyle(fontSize: 16, fontWeight: pw.FontWeight.bold)),
              ],
            ),
          ),
        );

    final doc = pw.Document();
    doc.addPage(
      pw.MultiPage(
        pageFormat: PdfPageFormat.a4,
        margin: const pw.EdgeInsets.all(32),
        build: (ctx) => [
          pw.Row(
            mainAxisAlignment: pw.MainAxisAlignment.spaceBetween,
            children: [
              pw.Column(
                crossAxisAlignment: pw.CrossAxisAlignment.start,
                children: [
                  pw.Text('CONSUMPTION & CLIMATE REPORT',
                      style: pw.TextStyle(fontSize: 16, fontWeight: pw.FontWeight.bold)),
                  pw.Text('Smart Home Energy & Environment Log',
                      style: pw.TextStyle(fontSize: 10, color: PdfColors.grey700)),
                ],
              ),
              pw.Column(
                crossAxisAlignment: pw.CrossAxisAlignment.end,
                children: [
                  pw.Text('Selected Month: $_month',
                      style: pw.TextStyle(fontSize: 9, color: PdfColors.grey700)),
                  pw.Text('Climate Source: $_sensorKey',
                      style: pw.TextStyle(fontSize: 9, color: PdfColors.grey700)),
                  pw.Text('Generated: ${DateTime.now().toLocal().toString().substring(0, 10)}',
                      style: pw.TextStyle(fontSize: 9, color: PdfColors.grey700)),
                ],
              ),
            ],
          ),
          pw.SizedBox(height: 16),
          pw.Divider(),
          pw.SizedBox(height: 16),
          pw.Row(
            children: [
              metric('Total Monthly Consumption', '${monthKwh.toStringAsFixed(1)} kWh'),
              pw.SizedBox(width: 24),
              metric('Total Estimated Cost', '${monthCost.toStringAsFixed(0)} RSD'),
            ],
          ),
          pw.SizedBox(height: 24),

          // Daily Power Consumption (kWh) bar chart
          pw.Text('Daily Power Consumption (kWh)',
              style: pw.TextStyle(fontSize: 11, fontWeight: pw.FontWeight.bold)),
          pw.SizedBox(height: 8),
          pw.SizedBox(
            height: 140,
            width: double.infinity,
            child: pw.Chart(
              grid: pw.CartesianGrid(
                xAxis: pw.FixedAxis<double>(
                  List.generate(rows.length, (i) => i.toDouble()),
                  format: (v) => (v >= 0 && v < rows.length)
                      ? (rows[v.toInt()]['date'] as String).substring(8)
                      : '',
                  textStyle: pw.TextStyle(fontSize: 6, color: PdfColors.grey700),
                ),
                yAxis: pw.FixedAxis<double>(
                  [0, maxKwh / 2, maxKwh],
                  format: (v) => v.toStringAsFixed(1),
                  divisions: true,
                  textStyle: pw.TextStyle(fontSize: 6, color: PdfColors.grey700),
                ),
              ),
              datasets: [
                pw.BarDataSet(
                  data: [
                    for (var i = 0; i < rows.length; i++)
                      if (rows[i]['kwh'] is num)
                        pw.PointChartValue(i.toDouble(), (rows[i]['kwh'] as num).toDouble()),
                  ],
                  color: PdfColors.indigo,
                  width: 6,
                ),
              ],
            ),
          ),
          pw.SizedBox(height: 16),

          // Daily Average Temperature (°C) line chart
          pw.Text('Daily Average Temperature (°C)',
              style: pw.TextStyle(fontSize: 11, fontWeight: pw.FontWeight.bold)),
          pw.SizedBox(height: 8),
          pw.SizedBox(
            height: 140,
            width: double.infinity,
            child: pw.Chart(
              grid: pw.CartesianGrid(
                xAxis: pw.FixedAxis<double>(
                  List.generate(rows.length, (i) => i.toDouble()),
                  format: (v) => (v >= 0 && v < rows.length)
                      ? (rows[v.toInt()]['date'] as String).substring(8)
                      : '',
                  textStyle: pw.TextStyle(fontSize: 6, color: PdfColors.grey700),
                ),
                yAxis: pw.FixedAxis<double>(
                  [minTemp, (minTemp + maxTemp) / 2, maxTemp],
                  format: (v) => v.toStringAsFixed(1),
                  divisions: true,
                  textStyle: pw.TextStyle(fontSize: 6, color: PdfColors.grey700),
                ),
              ),
              datasets: [
                pw.LineDataSet(
                  data: [
                    for (var i = 0; i < rows.length; i++)
                      if (rows[i]['temp'] is num)
                        pw.PointChartValue(i.toDouble(), (rows[i]['temp'] as num).toDouble()),
                  ],
                  color: PdfColors.blue,
                  pointSize: 2,
                ),
              ],
            ),
          ),
          pw.SizedBox(height: 24),

          pw.TableHelper.fromTextArray(
            headers: const [
              'Date',
              'Energy (kWh)',
              'Daily Cost (RSD)',
              'Avg Temp (°C)',
              'Avg Humidity (%)',
            ],
            data: rows
                .map((r) => [
                      r['date'] as String,
                      _num(r['kwh'] as num?, 1),
                      _num(r['cost'] as num?, 1),
                      _num(r['temp'] as num?, 1),
                      _num(r['humidity'] as num?, 0),
                    ])
                .toList(),
            headerStyle: pw.TextStyle(fontSize: 9, fontWeight: pw.FontWeight.bold),
            cellStyle: pw.TextStyle(fontSize: 9),
            headerDecoration: pw.BoxDecoration(color: PdfColors.blueGrey100),
            cellAlignments: const {
              0: pw.Alignment.centerLeft,
              1: pw.Alignment.centerRight,
              2: pw.Alignment.centerRight,
              3: pw.Alignment.centerRight,
              4: pw.Alignment.centerRight,
            },
            columnWidths: const {
              0: pw.FlexColumnWidth(2),
              1: pw.FlexColumnWidth(2.4),
              2: pw.FlexColumnWidth(2.6),
              3: pw.FlexColumnWidth(2.2),
              4: pw.FlexColumnWidth(2.6),
            },
          ),
          pw.SizedBox(height: 24),
          pw.Divider(),
          pw.SizedBox(height: 8),
          pw.Text('Historical Summary Report // AetherSmart Home Analytics',
              style: pw.TextStyle(fontSize: 8, color: PdfColors.grey600)),
        ],
      ),
    );

    await Printing.layoutPdf(onLayout: (format) async => doc.save());
  }

  @override
  Widget build(BuildContext context) {
    final isDark = Provider.of<ThemeProvider>(context).isDarkMode;

    return Scaffold(
      body: Consumer<HomeProvider>(
        builder: (context, provider, child) {
          final status = provider.status;
          final power = status?.power;

          return SingleChildScrollView(
            padding: const EdgeInsets.all(20),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  'Data Export & Print Reports',
                  style: GoogleFonts.outfit(fontSize: 20, fontWeight: FontWeight.bold),
                ),
                const SizedBox(height: 16),

                _buildExportCard(
                  context: context,
                  title: 'Export Structured JSON Log Payload',
                  description: 'Export real-time smart home sensor data, device DPs, and TV Box power readings in structured JSON format.',
                  icon: LucideIcons.file_code,
                  color: Colors.cyanAccent,
                  isDark: isDark,
                  onTap: () {
                    final jsonStr = const JsonEncoder.withIndent('  ').convert({
                      'app': 'AetherSmart',
                      'timestamp': status?.timestamp ?? 0,
                      'devices': status?.devices.map((d) => {
                        'id': d.id,
                        'name': d.name,
                        'location': d.location,
                        'temperature': d.temperature,
                        'humidity': d.humidity,
                        'batteryPercentage': d.batteryPercentage,
                        'isAlarm': d.isTempAlarm,
                      }).toList(),
                      'power': {
                        'watts': power?.currentLoadWatts,
                        'voltage': power?.voltage,
                        'currentAmps': power?.currentAmps,
                        'status': power?.status,
                      }
                    });
                    _showDataDialog(context, 'JSON Payload Log', jsonStr);
                  },
                ),
                const SizedBox(height: 16),

                _buildExportCard(
                  context: context,
                  title: 'Export CSV Telemetry Table',
                  description: 'Download comma-separated log table of power history for Excel, Google Sheets, or python analysis.',
                  icon: LucideIcons.table,
                  color: const Color(0xFF10B981),
                  isDark: isDark,
                  onTap: () {
                    final buffer = StringBuffer();
                    buffer.writeln('Timestamp,ISO_Time,PowerWatts,AccumulatedKwh');
                    for (var pt in provider.powerHistory) {
                      buffer.writeln('${pt.time.millisecondsSinceEpoch},${pt.time.toIso8601String()},${pt.watts},${provider.accumulatedKwh}');
                    }
                    _showDataDialog(context, 'CSV Telemetry Data', buffer.toString());
                  },
                ),
                const SizedBox(height: 16),

                _buildExportCard(
                  context: context,
                  title: 'Printable Summary Report Card',
                  description: 'View a clean formatted report card ready for printing or PDF export.',
                  icon: LucideIcons.printer,
                  color: Colors.purpleAccent,
                  isDark: isDark,
                  onTap: () {
                    _showReportCard(context, provider);
                  },
                ),
                const SizedBox(height: 28),

                _buildMonthlyReport(context, isDark),
              ],
            ),
          );
        },
      ),
    );
  }

  Widget _buildMonthlyReport(BuildContext context, bool isDark) {
    final deviceNames = [
      'Sensor 1',
      'Sensor 2',
    ];
    final status = Provider.of<HomeProvider>(context).status;
    if (status != null && status.devices.isNotEmpty) {
      deviceNames[0] = status.devices.first.name;
      if (status.devices.length > 1) deviceNames[1] = status.devices[1].name;
    }

    final monthRows = _reportRows(_month);
    final monthKwh = sumMonthlyKwh(_monthEnergy);
    final monthCost = sumMonthlyCostRsd(_monthEnergy);
    final fullRows = _reportRows('');

    return Container(
      padding: const EdgeInsets.all(20),
      decoration: BoxDecoration(
        color: isDark ? const Color(0xFF131B2E) : Colors.white,
        borderRadius: BorderRadius.circular(16),
        border: Border.all(color: isDark ? Colors.white.withValues(alpha: 0.08) : Colors.black12),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              const Icon(LucideIcons.file_down, color: Color(0xFF6366F1), size: 20),
              const SizedBox(width: 10),
              Text(
                'Monthly History Report',
                style: GoogleFonts.outfit(fontSize: 17, fontWeight: FontWeight.bold),
              ),
            ],
          ),
          const SizedBox(height: 16),

          if (_loading)
            const Padding(
              padding: EdgeInsets.symmetric(vertical: 24),
              child: Center(child: CircularProgressIndicator()),
            )
          else if (!_signedIn)
            Padding(
              padding: const EdgeInsets.symmetric(vertical: 12),
              child: Text(
                'Sign in with Google to load Firestore history (energy + climate).',
                style: GoogleFonts.inter(fontSize: 13, color: isDark ? Colors.white54 : Colors.black54),
              ),
            )
          else ...[
            Row(
              children: [
                Expanded(
                  child: DropdownButtonFormField<String>(
                    initialValue: _month,
                    decoration: InputDecoration(
                      labelText: 'Calendar Month',
                      labelStyle: TextStyle(color: isDark ? Colors.white54 : Colors.black54),
                      border: OutlineInputBorder(borderRadius: BorderRadius.circular(10)),
                    ),
                    items: _months
                        .map((m) => DropdownMenuItem(value: m, child: Text(m)))
                        .toList(),
                    onChanged: (v) => setState(() => _month = v ?? _month),
                  ),
                ),
                const SizedBox(width: 12),
                Expanded(
                  child: DropdownButtonFormField<String>(
                    initialValue: _sensorKey,
                    decoration: InputDecoration(
                      labelText: 'Climate Sensor',
                      labelStyle: TextStyle(color: isDark ? Colors.white54 : Colors.black54),
                      border: OutlineInputBorder(borderRadius: BorderRadius.circular(10)),
                    ),
                    items: [
                      DropdownMenuItem(value: 'sensor1', child: Text(deviceNames[0])),
                      DropdownMenuItem(value: 'sensor2', child: Text(deviceNames[1])),
                    ],
                    onChanged: (v) => setState(() => _sensorKey = v ?? _sensorKey),
                  ),
                ),
              ],
            ),
            const SizedBox(height: 16),

            Row(
              children: [
                _buildMetricBox('Total Consumption', '${monthKwh.toStringAsFixed(1)} kWh', const Color(0xFF6366F1), isDark),
                const SizedBox(width: 12),
                _buildMetricBox('Total Estimated Cost', '${monthCost.toStringAsFixed(0)} RSD', const Color(0xFFF59E0B), isDark),
              ],
            ),
            const SizedBox(height: 16),

            _buildTable(monthRows, isDark),
            const SizedBox(height: 16),

            Wrap(
              spacing: 12,
              runSpacing: 12,
              children: [
                _exportButton(
                  label: 'Export Month CSV',
                  icon: LucideIcons.file_down,
                  color: const Color(0xFF6366F1),
                  onPressed: monthRows.isEmpty
                      ? null
                      : () => _showDataDialog(
                            context,
                            'smart_home_report_$_month.csv',
                            _csvFor(monthRows),
                          ),
                ),
                _exportButton(
                  label: 'Export Full History CSV',
                  icon: LucideIcons.database,
                  color: const Color(0xFF10B981),
                  onPressed: fullRows.isEmpty
                      ? null
                      : () => _showDataDialog(
                            context,
                            'smart_home_full_history_${DateTime.now().toIso8601String().substring(0, 10)}.csv',
                            _csvFor(fullRows),
                          ),
                ),
                _exportButton(
                  label: 'Print / Save PDF Report',
                  icon: LucideIcons.printer,
                  color: const Color(0xFFF59E0B),
                  onPressed:
                      monthRows.isEmpty ? null : () => _printReport(monthRows),
                ),
              ],
            ),
          ],
        ],
      ),
    );
  }

  Widget _exportButton({
    required String label,
    required IconData icon,
    required Color color,
    required VoidCallback? onPressed,
  }) {
    return ElevatedButton.icon(
      style: ElevatedButton.styleFrom(
        backgroundColor: color,
        foregroundColor: Colors.white,
        padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 12),
      ),
      onPressed: onPressed,
      icon: Icon(icon, size: 16),
      label: Text(label),
    );
  }

  Widget _buildMetricBox(String label, String value, Color color, bool isDark) {
    return Expanded(
      child: Container(
        padding: const EdgeInsets.all(14),
        decoration: BoxDecoration(
          color: color.withValues(alpha: 0.12),
          borderRadius: BorderRadius.circular(12),
        ),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text(
              label.toUpperCase(),
              style: GoogleFonts.firaCode(fontSize: 10, fontWeight: FontWeight.bold, color: isDark ? Colors.white54 : Colors.black54),
            ),
            const SizedBox(height: 4),
            Text(value, style: GoogleFonts.outfit(fontSize: 18, fontWeight: FontWeight.bold, color: color)),
          ],
        ),
      ),
    );
  }

  Widget _buildTable(List<Map<String, dynamic>> rows, bool isDark) {
    final headerColor = isDark ? Colors.white70 : Colors.black87;
    final rowColor = isDark ? Colors.white70 : Colors.black87;
    final mutedColor = isDark ? Colors.white38 : Colors.black45;

    Widget cell(String text, {bool right = false, Color? color, bool bold = false, double width = 110}) {
      return SizedBox(
        width: width,
        child: Text(
          text,
          textAlign: right ? TextAlign.right : TextAlign.left,
          style: GoogleFonts.inter(
            fontSize: 12,
            fontWeight: bold ? FontWeight.bold : FontWeight.normal,
            color: color ?? rowColor,
          ),
        ),
      );
    }

    return Container(
      decoration: BoxDecoration(
        border: Border.all(color: isDark ? Colors.white12 : Colors.black12),
        borderRadius: BorderRadius.circular(10),
      ),
      child: SingleChildScrollView(
        scrollDirection: Axis.horizontal,
        child: Column(
          children: [
            Container(
              padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 10),
              decoration: BoxDecoration(color: isDark ? Colors.white10 : Colors.black12),
              child: Row(
                children: [
                  cell('Date', bold: true, color: headerColor),
                  cell('Energy (kWh)', right: true, bold: true, color: headerColor),
                  cell('Daily Cost (RSD)', right: true, bold: true, color: headerColor),
                  cell('Avg Temp (°C)', right: true, bold: true, color: headerColor),
                  cell('Avg Humidity (%)', right: true, bold: true, color: headerColor, width: 130),
                ],
              ),
            ),
            if (rows.isEmpty)
              Padding(
                padding: const EdgeInsets.all(20),
                child: Text(
                  'No historical data found for this calendar month.',
                  style: GoogleFonts.inter(fontSize: 13, color: mutedColor),
                ),
              )
            else
              for (final r in rows)
                Container(
                  padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
                  decoration: BoxDecoration(
                    border: Border(top: BorderSide(color: isDark ? Colors.white10 : Colors.black12)),
                  ),
                  child: Row(
                    children: [
                      cell(r['date'] as String),
                      cell(_num(r['kwh'] as num?, 1), right: true),
                      cell(_num(r['cost'] as num?, 1), right: true),
                      cell(_num(r['temp'] as num?, 1), right: true),
                      cell(_num(r['humidity'] as num?, 0), right: true, width: 130),
                    ],
                  ),
                ),
          ],
        ),
      ),
    );
  }

  Widget _buildExportCard({
    required BuildContext context,
    required String title,
    required String description,
    required IconData icon,
    required Color color,
    required bool isDark,
    required VoidCallback onTap,
  }) {
    return Container(
      padding: const EdgeInsets.all(20),
      decoration: BoxDecoration(
        color: isDark ? const Color(0xFF1E293B) : Colors.white,
        borderRadius: BorderRadius.circular(16),
        border: Border.all(color: color.withValues(alpha: 0.3)),
      ),
      child: Row(
        children: [
          Container(
            padding: const EdgeInsets.all(14),
            decoration: BoxDecoration(
              color: color.withValues(alpha: 0.15),
              borderRadius: BorderRadius.circular(12),
            ),
            child: Icon(icon, color: color, size: 28),
          ),
          const SizedBox(width: 16),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  title,
                  style: GoogleFonts.outfit(fontSize: 16, fontWeight: FontWeight.bold),
                ),
                const SizedBox(height: 4),
                Text(
                  description,
                  style: GoogleFonts.inter(fontSize: 13, color: Colors.grey),
                ),
                const SizedBox(height: 12),
                ElevatedButton.icon(
                  style: ElevatedButton.styleFrom(
                    backgroundColor: color.withValues(alpha: 0.2),
                    foregroundColor: color,
                    elevation: 0,
                  ),
                  onPressed: onTap,
                  icon: const Icon(LucideIcons.download, size: 16),
                  label: const Text('View & Export'),
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }

  void _showDataDialog(BuildContext context, String title, String data) {
    showDialog(
      context: context,
      builder: (ctx) => AlertDialog(
        backgroundColor: const Color(0xFF1E293B),
        title: Text(title, style: GoogleFonts.outfit(color: Colors.white)),
        content: SizedBox(
          width: 550,
          child: SingleChildScrollView(
            child: SelectableText(
              data,
              style: GoogleFonts.firaCode(fontSize: 12, color: Colors.white70),
            ),
          ),
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.of(ctx).pop(),
            child: const Text('Close', style: TextStyle(color: Colors.blueAccent)),
          ),
        ],
      ),
    );
  }

  void _showReportCard(BuildContext context, HomeProvider provider) {
    final status = provider.status;
    final power = status?.power;

    showDialog(
      context: context,
      builder: (ctx) => AlertDialog(
        backgroundColor: const Color(0xFF0F172A),
        title: Row(
          children: [
            const Icon(LucideIcons.zap, color: Colors.amberAccent, size: 24),
            const SizedBox(width: 10),
            Text('AetherSmart Summary Report', style: GoogleFonts.outfit(color: Colors.white, fontWeight: FontWeight.bold)),
          ],
        ),
        content: SizedBox(
          width: 550,
          child: Column(
            mainAxisSize: MainAxisSize.min,
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text('Report Generated: ${DateTime.now().toLocal().toString().substring(0, 19)}',
                  style: GoogleFonts.inter(color: Colors.grey, fontSize: 12)),
              const Divider(color: Colors.white24, height: 20),
              Text('Power Summary:', style: GoogleFonts.outfit(color: Colors.amberAccent, fontWeight: FontWeight.bold)),
              const SizedBox(height: 6),
              Text('Current Real-Time Load: ${power?.currentLoadWatts.toStringAsFixed(1) ?? "0"} Watts', style: const TextStyle(color: Colors.white70)),
              Text('Peak Demand: ${provider.peakDemandKw.toStringAsFixed(2)} kW', style: const TextStyle(color: Colors.white70)),
              Text('Accumulated Session Energy: ${provider.accumulatedKwh.toStringAsFixed(4)} kWh', style: const TextStyle(color: Colors.white70)),
              const SizedBox(height: 16),
              Text('Climate Sensors:', style: GoogleFonts.outfit(color: Colors.blueAccent, fontWeight: FontWeight.bold)),
              const SizedBox(height: 6),
              if (status != null && status.devices.isNotEmpty)
                for (var d in status.devices)
                  Text('${d.name} (${d.location}): ${d.temperature?.toStringAsFixed(1)}°C / ${d.humidity}% RH',
                      style: const TextStyle(color: Colors.white70)),
            ],
          ),
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.of(ctx).pop(),
            child: const Text('Close', style: TextStyle(color: Colors.blueAccent)),
          ),
        ],
      ),
    );
  }
}
