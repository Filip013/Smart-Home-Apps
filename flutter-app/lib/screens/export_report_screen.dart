import 'dart:convert';
import 'package:flutter/material.dart';
import 'package:flutter_lucide/flutter_lucide.dart';
import 'package:google_fonts/google_fonts.dart';
import 'package:provider/provider.dart';
import '../providers/home_provider.dart';
import '../providers/theme_provider.dart';

class ExportReportScreen extends StatelessWidget {
  const ExportReportScreen({super.key});

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
              ],
            ),
          );
        },
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
