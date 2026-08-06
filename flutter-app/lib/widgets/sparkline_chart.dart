import 'package:fl_chart/fl_chart.dart';
import 'package:flutter/material.dart';
import 'package:google_fonts/google_fonts.dart';

class MiniSparklineChart extends StatelessWidget {
  final String title;
  final List<double> values;
  final Color color;
  final double height;
  final String suffix;
  final bool isPowerChart;

  const MiniSparklineChart({
    super.key,
    required this.title,
    required this.values,
    this.color = const Color(0xFF6366F1),
    this.height = 120,
    this.suffix = '',
    this.isPowerChart = false,
  });

  @override
  Widget build(BuildContext context) {
    if (values.isEmpty) return const SizedBox.shrink();

    final spots = values.asMap().entries.map((e) {
      return FlSpot(e.key.toDouble(), e.value);
    }).toList();

    final double maxVal = values.reduce((a, b) => a > b ? a : b);
    final double minY = 0.0;
    final double maxY = isPowerChart ? (maxVal > 300 ? 447.0 : maxVal * 1.3) : (maxVal > 0 ? maxVal * 1.15 : 100.0);

    const timeLabels = ['12:00', '16:00', '20:00', '00:00', '04:00', '08:00', '11:00'];

    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text(
          title,
          style: GoogleFonts.inter(
            fontSize: 12,
            fontWeight: FontWeight.w500,
            color: Colors.white54,
          ),
        ),
        const SizedBox(height: 8),
        SizedBox(
          height: height,
          child: LineChart(
            LineChartData(
              minY: minY,
              maxY: maxY,
              gridData: const FlGridData(show: false),
              titlesData: FlTitlesData(
                leftTitles: AxisTitles(
                  sideTitles: SideTitles(
                    showTitles: true,
                    reservedSize: 36,
                    getTitlesWidget: (val, meta) {
                      if (val == minY || val == maxY || (val - (maxY / 2)).abs() < (maxY / 4)) {
                        return Text(
                          val.toStringAsFixed(0),
                          style: GoogleFonts.firaCode(fontSize: 9, color: Colors.white38),
                        );
                      }
                      return const SizedBox.shrink();
                    },
                  ),
                ),
                bottomTitles: AxisTitles(
                  sideTitles: SideTitles(
                    showTitles: true,
                    getTitlesWidget: (val, meta) {
                      final idx = val.toInt();
                      if (idx % 3 == 0 && idx ~/ 3 < timeLabels.length) {
                        return Padding(
                          padding: const EdgeInsets.only(top: 4.0),
                          child: Text(
                            timeLabels[idx ~/ 3],
                            style: GoogleFonts.firaCode(fontSize: 9, color: Colors.white38),
                          ),
                        );
                      }
                      return const SizedBox.shrink();
                    },
                  ),
                ),
                topTitles: const AxisTitles(sideTitles: SideTitles(showTitles: false)),
                rightTitles: const AxisTitles(sideTitles: SideTitles(showTitles: false)),
              ),
              borderData: FlBorderData(show: false),
              lineBarsData: [
                LineChartBarData(
                  spots: spots,
                  isCurved: true,
                  color: color,
                  barWidth: 2.5,
                  isStrokeCapRound: true,
                  dotData: const FlDotData(show: false),
                  belowBarData: BarAreaData(
                    show: true,
                    color: color.withValues(alpha: 0.15),
                  ),
                ),
              ],
            ),
          ),
        ),
      ],
    );
  }
}
