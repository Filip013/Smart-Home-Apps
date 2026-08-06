import 'package:flutter/material.dart';
import 'package:flutter_lucide/flutter_lucide.dart';
import 'package:google_fonts/google_fonts.dart';
import 'package:provider/provider.dart';
import 'package:wear/wear.dart';
import '../providers/home_provider.dart';

class WearOsScreen extends StatelessWidget {
  const WearOsScreen({super.key});

  @override
  Widget build(BuildContext context) {
    return WatchShape(
      builder: (context, shape, child) {
        return AmbientMode(
          builder: (context, mode, child) {
            final isAmbient = mode == WearMode.ambient;

            return Scaffold(
              backgroundColor: isAmbient ? Colors.black : const Color(0xFF0F172A),
              body: Center(
                child: Consumer<HomeProvider>(
                  builder: (context, provider, _) {
                    if (provider.isLoading && provider.status == null) {
                      return const CircularProgressIndicator(color: Colors.blueAccent);
                    }

                    final status = provider.status;
                    final device = status?.devices.isNotEmpty == true ? status!.devices.first : null;
                    final power = status?.power;

                    final tempStr = device?.temperature != null
                        ? '${device!.temperature!.toStringAsFixed(1)}°C'
                        : '--°C';
                    final humStr = device?.humidity != null ? '${device!.humidity}%' : '--%';
                    final wattsStr = power != null ? '${power.currentLoadWatts.toStringAsFixed(0)}W' : '--W';

                    return Padding(
                      padding: const EdgeInsets.all(12.0),
                      child: Column(
                        mainAxisAlignment: MainAxisAlignment.center,
                        children: [
                          Row(
                            mainAxisAlignment: MainAxisAlignment.center,
                            children: [
                              Icon(
                                LucideIcons.thermometer,
                                size: 16,
                                color: isAmbient ? Colors.white70 : Colors.blueAccent,
                              ),
                              const SizedBox(width: 4),
                              Text(
                                tempStr,
                                style: GoogleFonts.outfit(
                                  fontSize: 26,
                                  fontWeight: FontWeight.bold,
                                  color: isAmbient ? Colors.white : Colors.blueAccent,
                                ),
                              ),
                            ],
                          ),
                          const SizedBox(height: 6),
                          Row(
                            mainAxisAlignment: MainAxisAlignment.spaceEvenly,
                            children: [
                              Row(
                                children: [
                                  Icon(LucideIcons.droplets, size: 14, color: isAmbient ? Colors.white54 : Colors.cyanAccent),
                                  const SizedBox(width: 2),
                                  Text(
                                    humStr,
                                    style: GoogleFonts.inter(fontSize: 14, color: isAmbient ? Colors.white70 : Colors.cyanAccent),
                                  ),
                                ],
                              ),
                              Row(
                                children: [
                                  Icon(LucideIcons.zap, size: 14, color: isAmbient ? Colors.white54 : Colors.amberAccent),
                                  const SizedBox(width: 2),
                                  Text(
                                    wattsStr,
                                    style: GoogleFonts.inter(fontSize: 14, color: isAmbient ? Colors.white70 : Colors.amberAccent),
                                  ),
                                ],
                              ),
                            ],
                          ),
                          if (!isAmbient) ...[
                            const SizedBox(height: 12),
                            InkWell(
                              onTap: () => provider.refreshData(),
                              borderRadius: BorderRadius.circular(20),
                              child: Container(
                                padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 6),
                                decoration: BoxDecoration(
                                  color: Colors.blueAccent.withValues(alpha: 0.2),
                                  borderRadius: BorderRadius.circular(20),
                                  border: Border.all(color: Colors.blueAccent.withValues(alpha: 0.4)),
                                ),
                                child: Row(
                                  mainAxisSize: MainAxisSize.min,
                                  children: [
                                    const Icon(LucideIcons.rotate_cw, size: 12, color: Colors.blueAccent),
                                    const SizedBox(width: 4),
                                    Text('Refresh', style: GoogleFonts.inter(fontSize: 11, color: Colors.white)),
                                  ],
                                ),
                              ),
                            ),
                          ],
                        ],
                      ),
                    );
                  },
                ),
              ),
            );
          },
        );
      },
    );
  }
}
