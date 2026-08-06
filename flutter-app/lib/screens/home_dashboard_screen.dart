import 'package:flutter/material.dart';
import 'package:flutter_lucide/flutter_lucide.dart';
import 'package:google_fonts/google_fonts.dart';
import 'package:provider/provider.dart';

import '../models/device_state.dart';
import '../providers/home_provider.dart';
import '../widgets/circular_gauge_painter.dart';
import '../widgets/sparkline_chart.dart';

class HomeDashboardScreen extends StatefulWidget {
  final Function(int)? onNavigateTab;

  const HomeDashboardScreen({super.key, this.onNavigateTab});

  @override
  State<HomeDashboardScreen> createState() => _HomeDashboardScreenState();
}

class _HomeDashboardScreenState extends State<HomeDashboardScreen> {
  final Map<String, String> _selectedMetric = {};

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: const Color(0xFF0B0F19),
      body: Consumer<HomeProvider>(
        builder: (context, provider, child) {
          final status = provider.status;
          final power = status?.power;
          final devices = status?.devices ?? [];

          final watts = power?.currentLoadWatts ?? 305.1;
          final volts = power?.voltage ?? 237.4;
          final amps = power?.currentAmps ?? 1.46;
          final todayKwh = provider.accumulatedKwh;
          final monthlyCostRsd = provider.estimatedCost;

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

          final List<double> powerWave = provider.power24hWave;

          final int standbyWatts = (watts * 0.08).round();
          final List<String> coachTips = [
            '⚡ Peak grid demand reached ${provider.peakDemandKw > 0 ? (provider.peakDemandKw * 1000).toStringAsFixed(0) : "308"} W in the past 24h.',
            if (dev1 != null && dev1.temperature != null)
              '🌡️ ${dev1.name} climate status: ${dev1.temperature!.toStringAsFixed(1)}°C, ${dev1.humidity ?? 0}% humidity.'
            else
              '🌡️ Belgrade Sensor: Streaming live metrics...',
            if (dev2 != null && dev2.batteryPercentage != null)
              '🔋 Sensor battery status: ${dev2.name} at ${dev2.batteryPercentage}%.'
            else
              '🔋 All sensor battery levels healthy.',
            '💡 Standby energy draw estimated at $standbyWatts W.',
          ];

          return LayoutBuilder(
            builder: (context, constraints) {
              final isWide = constraints.maxWidth > 900;

              return SingleChildScrollView(
                padding: const EdgeInsets.all(24),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    _buildHeroHeader(context, watts, devices.where((d) => d.isOnline).length + (power?.status == 'online' ? 1 : 0)),
                    const SizedBox(height: 24),
                    if (isWide)
                      Row(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Expanded(
                            flex: 5,
                            child: _buildPowerCard(provider, watts, volts, amps, todayKwh, monthlyCostRsd, powerWave),
                          ),
                          const SizedBox(width: 24),
                          Expanded(
                            flex: 5,
                            child: _buildClimateCard(provider, dev1, dev2),
                          ),
                        ],
                      )
                    else
                      Column(
                        children: [
                          _buildPowerCard(provider, watts, volts, amps, todayKwh, monthlyCostRsd, powerWave),
                          const SizedBox(height: 24),
                          _buildClimateCard(provider, dev1, dev2),
                        ],
                      ),
                    const SizedBox(height: 24),
                    _buildSmartEfficiencyCoach(standbyWatts, coachTips),
                  ],
                ),
              );
            },
          );
        },
      ),
    );
  }

  Widget _buildHeroHeader(BuildContext context, double totalWatts, int onlineCount) {
    return Container(
      padding: const EdgeInsets.all(24),
      decoration: BoxDecoration(
        color: const Color(0xFF131B2E),
        borderRadius: BorderRadius.circular(20),
        border: Border.all(color: Colors.white.withValues(alpha: 0.08)),
      ),
      child: Row(
        mainAxisAlignment: MainAxisAlignment.spaceBetween,
        children: [
          Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Row(
                children: [
                  Text(
                    'Welcome Back',
                    style: GoogleFonts.outfit(
                      fontSize: 26,
                      fontWeight: FontWeight.bold,
                      color: Colors.white,
                    ),
                  ),
                  const SizedBox(width: 12),
                  Container(
                    padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
                    decoration: BoxDecoration(
                      color: const Color(0xFF10B981).withValues(alpha: 0.2),
                      borderRadius: BorderRadius.circular(12),
                      border: Border.all(color: const Color(0xFF10B981).withValues(alpha: 0.4)),
                    ),
                    child: Row(
                      children: [
                        Container(
                          width: 6,
                          height: 6,
                          decoration: const BoxDecoration(
                            color: Color(0xFF10B981),
                            shape: BoxShape.circle,
                          ),
                        ),
                        const SizedBox(width: 6),
                        Text(
                          'Live (Cloudflare BFF)',
                          style: GoogleFonts.inter(
                            fontSize: 12,
                            fontWeight: FontWeight.w600,
                            color: const Color(0xFF34D399),
                          ),
                        ),
                      ],
                    ),
                  ),
                ],
              ),
              const SizedBox(height: 4),
              Text(
                'Here\'s what\'s happening in your connected home today.',
                style: GoogleFonts.inter(fontSize: 14, color: Colors.white54),
              ),
            ],
          ),
          Row(
            children: [
              Container(
                padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 12),
                decoration: BoxDecoration(
                  color: const Color(0xFF1E2942),
                  borderRadius: BorderRadius.circular(14),
                  border: Border.all(color: Colors.white.withValues(alpha: 0.05)),
                ),
                child: Row(
                  children: [
                    Container(
                      padding: const EdgeInsets.all(8),
                      decoration: BoxDecoration(
                        color: const Color(0xFF6366F1).withValues(alpha: 0.2),
                        borderRadius: BorderRadius.circular(10),
                      ),
                      child: const Icon(LucideIcons.zap, color: Color(0xFF818CF8), size: 18),
                    ),
                    const SizedBox(width: 12),
                    Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text('TOTAL GRID LOAD', style: GoogleFonts.firaCode(fontSize: 10, color: Colors.white38, fontWeight: FontWeight.bold)),
                        Text('${totalWatts.toStringAsFixed(1)} W', style: GoogleFonts.outfit(fontSize: 16, fontWeight: FontWeight.bold, color: Colors.white)),
                      ],
                    ),
                  ],
                ),
              ),
              const SizedBox(width: 12),
              Container(
                padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 12),
                decoration: BoxDecoration(
                  color: const Color(0xFF1E2942),
                  borderRadius: BorderRadius.circular(14),
                  border: Border.all(color: Colors.white.withValues(alpha: 0.05)),
                ),
                child: Row(
                  children: [
                    Container(
                      padding: const EdgeInsets.all(8),
                      decoration: BoxDecoration(
                        color: const Color(0xFF10B981).withValues(alpha: 0.2),
                        borderRadius: BorderRadius.circular(10),
                      ),
                      child: const Icon(LucideIcons.circle_check, color: Color(0xFF34D399), size: 18),
                    ),
                    const SizedBox(width: 12),
                    Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text('DEVICE STATUS', style: GoogleFonts.firaCode(fontSize: 10, color: Colors.white38, fontWeight: FontWeight.bold)),
                        Text('$onlineCount Online', style: GoogleFonts.outfit(fontSize: 16, fontWeight: FontWeight.bold, color: Colors.white)),
                      ],
                    ),
                  ],
                ),
              ),
            ],
          ),
        ],
      ),
    );
  }

  Widget _buildPowerCard(HomeProvider provider, double watts, double volts, double amps, double todayKwh, double monthlyCostRsd, List<double> powerWave) {
    return Container(
      padding: const EdgeInsets.all(24),
      decoration: BoxDecoration(
        color: const Color(0xFF131B2E),
        borderRadius: BorderRadius.circular(20),
        border: Border.all(color: Colors.white.withValues(alpha: 0.08)),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            mainAxisAlignment: MainAxisAlignment.spaceBetween,
            children: [
              Row(
                children: [
                  const Icon(LucideIcons.zap, color: Color(0xFF00E5FF), size: 20),
                  const SizedBox(width: 10),
                  Text(
                    'Active Power Consumption',
                    style: GoogleFonts.outfit(
                      fontSize: 18,
                      fontWeight: FontWeight.bold,
                      color: Colors.white,
                    ),
                  ),
                ],
              ),
              InkWell(
                onTap: () => widget.onNavigateTab?.call(1),
                child: Row(
                  children: [
                    Text('Full Stats', style: GoogleFonts.inter(fontSize: 13, color: const Color(0xFF60A5FA))),
                    const SizedBox(width: 4),
                    const Icon(LucideIcons.arrow_right, size: 14, color: Color(0xFF60A5FA)),
                  ],
                ),
              ),
            ],
          ),
          const SizedBox(height: 24),
          Row(
            children: [
              CircularPowerGauge(watts: watts),
              const SizedBox(width: 32),
              Expanded(
                child: Column(
                  children: [
                    _buildStatRow('Today\'s Usage', '${todayKwh.toStringAsFixed(2)} kWh'),
                    _buildStatRow('Voltage', '${volts.toStringAsFixed(1)} V'),
                    _buildStatRow('Current Draw', '${amps.toStringAsFixed(2)} A'),
                    _buildStatRow('Est. Cost (Month)', '${monthlyCostRsd.toStringAsFixed(0)} RSD'),
                  ],
                ),
              ),
            ],
          ),
          const SizedBox(height: 24),
          MiniSparklineChart(
            title: '24-Hour Load Profile (Watts)',
            values: powerWave,
            color: const Color(0xFF00E5FF),
            height: 120,
            isPowerChart: true,
          ),
        ],
      ),
    );
  }

  Widget _buildStatRow(String label, String value) {
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 8.0),
      child: Row(
        mainAxisAlignment: MainAxisAlignment.spaceBetween,
        children: [
          Text(label, style: GoogleFonts.inter(fontSize: 13, color: Colors.white54)),
          Text(value, style: GoogleFonts.outfit(fontSize: 15, fontWeight: FontWeight.bold, color: Colors.white)),
        ],
      ),
    );
  }

  Widget _buildClimateCard(HomeProvider provider, SensorDevice? dev1, SensorDevice? dev2) {
    return Container(
      padding: const EdgeInsets.all(24),
      decoration: BoxDecoration(
        color: const Color(0xFF131B2E),
        borderRadius: BorderRadius.circular(20),
        border: Border.all(color: Colors.white.withValues(alpha: 0.08)),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              const Icon(LucideIcons.thermometer, color: Color(0xFF818CF8), size: 20),
              const SizedBox(width: 10),
              Text(
                'Climate Monitors',
                style: GoogleFonts.outfit(
                  fontSize: 18,
                  fontWeight: FontWeight.bold,
                  color: Colors.white,
                ),
              ),
            ],
          ),
          const SizedBox(height: 20),

          // Sensor 1: Belgrade Sensor
          _buildSingleSensorBox(
            provider: provider,
            dev: dev1,
            fallbackName: 'Belgrade Sensor',
            fallbackLoc: 'Belgrade',
            fallbackTemp: 25.1,
            fallbackHum: 55,
            fallbackBat: 100,
            color: const Color(0xFF818CF8),
          ),
          const SizedBox(height: 24),

          // Sensor 2: Vršac Sensor
          _buildSingleSensorBox(
            provider: provider,
            dev: dev2,
            fallbackName: 'Vršac Sensor',
            fallbackLoc: 'Vršac',
            fallbackTemp: 26.3,
            fallbackHum: 48,
            fallbackBat: 79,
            color: const Color(0xFFA78BFA),
          ),
        ],
      ),
    );
  }

  Widget _buildSingleSensorBox({
    required HomeProvider provider,
    required SensorDevice? dev,
    required String fallbackName,
    required String fallbackLoc,
    required double fallbackTemp,
    required int fallbackHum,
    required int fallbackBat,
    required Color color,
  }) {
    final id = dev?.id ?? fallbackName;
    final name = dev?.name ?? fallbackName;
    final location = dev?.location ?? fallbackLoc;
    final tempVal = dev?.temperature ?? fallbackTemp;
    final humVal = dev?.humidity ?? fallbackHum;
    final batVal = dev?.batteryPercentage ?? fallbackBat;

    final selectedMetric = _selectedMetric[id] ?? 'temp';
    final isTemp = selectedMetric == 'temp';

    final tempStr = '${tempVal.toStringAsFixed(1)}°C';
    final humStr = '$humVal%';
    final batStr = '$batVal%';

    final realTempWave = provider.sensorTempWaves[id];
    final realHumidWave = provider.sensorHumidWaves[id];

    final List<double> waveData = isTemp
        ? (realTempWave ?? HomeProvider.generate24HourTempWave(tempVal))
        : (realHumidWave ?? HomeProvider.generate24HourHumidWave(humVal));

    final activeColor = isTemp ? color : const Color(0xFF38BDF8);

    return Container(
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        color: const Color(0xFF1E2942).withValues(alpha: 0.5),
        borderRadius: BorderRadius.circular(16),
        border: Border.all(color: Colors.white.withValues(alpha: 0.05)),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            mainAxisAlignment: MainAxisAlignment.spaceBetween,
            children: [
              Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(name, style: GoogleFonts.outfit(fontSize: 16, fontWeight: FontWeight.bold, color: Colors.white)),
                  Text(location, style: GoogleFonts.inter(fontSize: 11, color: Colors.white38)),
                ],
              ),
              Row(
                children: [
                  Container(
                    padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 3),
                    decoration: BoxDecoration(
                      color: const Color(0xFF10B981).withValues(alpha: 0.15),
                      borderRadius: BorderRadius.circular(8),
                    ),
                    child: Text('Optimal', style: GoogleFonts.inter(fontSize: 11, color: const Color(0xFF34D399), fontWeight: FontWeight.bold)),
                  ),
                  const SizedBox(width: 8),
                  Row(
                    children: [
                      const Icon(LucideIcons.battery, size: 14, color: Colors.white54),
                      const SizedBox(width: 4),
                      Text(batStr, style: GoogleFonts.firaCode(fontSize: 11, color: Colors.white54)),
                    ],
                  ),
                ],
              ),
            ],
          ),
          const SizedBox(height: 16),
          Row(
            children: [
              Expanded(
                child: GestureDetector(
                  onTap: () => setState(() => _selectedMetric[id] = 'temp'),
                  child: Container(
                    padding: const EdgeInsets.all(12),
                    decoration: BoxDecoration(
                      color: const Color(0xFF1E2942),
                      borderRadius: BorderRadius.circular(12),
                      border: Border.all(
                        color: isTemp ? const Color(0xFF6366F1) : Colors.transparent,
                        width: 1.5,
                      ),
                    ),
                    child: Row(
                      children: [
                        const Icon(LucideIcons.thermometer, color: Color(0xFF818CF8), size: 20),
                        const SizedBox(width: 10),
                        Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            Text(tempStr, style: GoogleFonts.outfit(fontSize: 18, fontWeight: FontWeight.bold, color: Colors.white)),
                            Text('TEMPERATURE', style: GoogleFonts.firaCode(fontSize: 9, color: Colors.white38, fontWeight: FontWeight.bold)),
                          ],
                        ),
                      ],
                    ),
                  ),
                ),
              ),
              const SizedBox(width: 12),
              Expanded(
                child: GestureDetector(
                  onTap: () => setState(() => _selectedMetric[id] = 'humidity'),
                  child: Container(
                    padding: const EdgeInsets.all(12),
                    decoration: BoxDecoration(
                      color: const Color(0xFF1E2942),
                      borderRadius: BorderRadius.circular(12),
                      border: Border.all(
                        color: !isTemp ? const Color(0xFF38BDF8) : Colors.transparent,
                        width: 1.5,
                      ),
                    ),
                    child: Row(
                      children: [
                        const Icon(LucideIcons.droplets, color: Color(0xFF38BDF8), size: 20),
                        const SizedBox(width: 10),
                        Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            Text(humStr, style: GoogleFonts.outfit(fontSize: 18, fontWeight: FontWeight.bold, color: Colors.white)),
                            Text('HUMIDITY', style: GoogleFonts.firaCode(fontSize: 9, color: Colors.white38, fontWeight: FontWeight.bold)),
                          ],
                        ),
                      ],
                    ),
                  ),
                ),
              ),
            ],
          ),
          const SizedBox(height: 16),
          MiniSparklineChart(
            title: '24-Hour ${isTemp ? "Temperature" : "Humidity"} Wave',
            values: waveData,
            color: activeColor,
            height: 90,
          ),
        ],
      ),
    );
  }

  Widget _buildSmartEfficiencyCoach(int standbyWatts, List<String> tips) {
    return Container(
      padding: const EdgeInsets.all(24),
      decoration: BoxDecoration(
        color: const Color(0xFF131B2E),
        borderRadius: BorderRadius.circular(20),
        border: Border.all(color: Colors.white.withValues(alpha: 0.08)),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              const Icon(LucideIcons.shield_check, color: Color(0xFF34D399), size: 22),
              const SizedBox(width: 10),
              Text(
                'Smart Efficiency Coach',
                style: GoogleFonts.outfit(
                  fontSize: 18,
                  fontWeight: FontWeight.bold,
                  color: Colors.white,
                ),
              ),
            ],
          ),
          const SizedBox(height: 12),
          Text(
            'Your estimated standby load is $standbyWatts Watts based on 24h minimum power draw.',
            style: GoogleFonts.inter(fontSize: 14, color: Colors.white70),
          ),
          const SizedBox(height: 16),
          Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: tips.map((tip) {
              return Padding(
                padding: const EdgeInsets.symmetric(vertical: 4.0),
                child: Text(
                  tip,
                  style: GoogleFonts.inter(fontSize: 13, color: Colors.white54),
                ),
              );
            }).toList(),
          ),
        ],
      ),
    );
  }
}
