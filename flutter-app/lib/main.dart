import 'package:flutter/material.dart';
import 'package:flutter_lucide/flutter_lucide.dart';
import 'package:google_fonts/google_fonts.dart';
import 'package:provider/provider.dart';

import 'providers/home_provider.dart';
import 'providers/theme_provider.dart';
import 'screens/export_report_screen.dart';
import 'screens/home_dashboard_screen.dart';
import 'screens/power_details_screen.dart';
import 'screens/settings_screen.dart';
import 'screens/wear_os_screen.dart';
import 'services/auth_service.dart';
import 'services/settings_service.dart';

void main() async {
  WidgetsFlutterBinding.ensureInitialized();
  await AuthService.initializeFirebase();
  final settingsService = await SettingsService.init();
  final authService = AuthService();

  runApp(
    MultiProvider(
      providers: [
        ChangeNotifierProvider(create: (_) => ThemeProvider()),
        ChangeNotifierProvider(create: (_) => authService),
        ChangeNotifierProvider(
          create: (_) => HomeProvider(settingsService: settingsService, authService: authService),
        ),
      ],
      child: SmartHomeApp(settingsService: settingsService),
    ),
  );
}

class SmartHomeApp extends StatelessWidget {
  final SettingsService settingsService;

  const SmartHomeApp({super.key, required this.settingsService});

  @override
  Widget build(BuildContext context) {
    final themeProvider = Provider.of<ThemeProvider>(context);

    return MaterialApp(
      title: 'AetherSmart',
      debugShowCheckedModeBanner: false,
      themeMode: themeProvider.themeMode,
      theme: ThemeProvider.lightTheme,
      darkTheme: ThemeProvider.darkTheme,
      home: Builder(
        builder: (context) {
          final size = MediaQuery.of(context).size;
          final isSmallWatch = size.width <= 250 && size.height <= 250;

          if (isSmallWatch) {
            return const WearOsScreen();
          }
          return MainNavigationShell(settingsService: settingsService);
        },
      ),
    );
  }
}

class MainNavigationShell extends StatefulWidget {
  final SettingsService settingsService;

  const MainNavigationShell({super.key, required this.settingsService});

  @override
  State<MainNavigationShell> createState() => _MainNavigationShellState();
}

class _MainNavigationShellState extends State<MainNavigationShell> {
  int _currentIndex = 0;

  @override
  Widget build(BuildContext context) {
    final themeProvider = Provider.of<ThemeProvider>(context);
    final authService = Provider.of<AuthService>(context);
    final isDark = themeProvider.isDarkMode;
    final size = MediaQuery.of(context).size;
    final isDesktop = size.width > 750;

    final screens = [
      HomeDashboardScreen(onNavigateTab: (idx) => setState(() => _currentIndex = idx)),
      const PowerDetailsScreen(),
      const ExportReportScreen(),
      SettingsScreen(settingsService: widget.settingsService),
    ];

    final navItems = [
      {'label': 'Dashboard', 'icon': LucideIcons.layout_dashboard},
      {'label': 'Power & Climate', 'icon': LucideIcons.activity},
      {'label': 'Export & Print', 'icon': LucideIcons.file_down},
      {'label': 'Settings', 'icon': LucideIcons.settings},
    ];

    final user = authService.currentUser;

    return Scaffold(
      backgroundColor: isDark ? const Color(0xFF0B0F19) : const Color(0xFFF8FAFC),
      appBar: PreferredSize(
        preferredSize: const Size.fromHeight(70),
        child: Container(
          decoration: BoxDecoration(
            color: isDark ? const Color(0xFF131B2E) : Colors.white,
            border: Border(bottom: BorderSide(color: isDark ? Colors.white.withValues(alpha: 0.08) : Colors.black12)),
          ),
          child: SafeArea(
            child: Padding(
              padding: const EdgeInsets.symmetric(horizontal: 24.0),
              child: Row(
                mainAxisAlignment: MainAxisAlignment.spaceBetween,
                children: [
                  // Left Brand Logo & Title
                  Row(
                    children: [
                      Container(
                        padding: const EdgeInsets.all(10),
                        decoration: BoxDecoration(
                          color: const Color(0xFF3B82F6).withValues(alpha: 0.2),
                          borderRadius: BorderRadius.circular(12),
                          border: Border.all(color: const Color(0xFF3B82F6).withValues(alpha: 0.4)),
                        ),
                        child: const Icon(LucideIcons.zap, color: Color(0xFF60A5FA), size: 22),
                      ),
                      const SizedBox(width: 14),
                      Column(
                        mainAxisAlignment: MainAxisAlignment.center,
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Text(
                            'AetherSmart',
                            style: GoogleFonts.outfit(
                              fontSize: 22,
                              fontWeight: FontWeight.bold,
                              color: isDark ? Colors.white : const Color(0xFF0F172A),
                            ),
                          ),
                          Text(
                            'Smart Energy & Climate',
                            style: GoogleFonts.inter(fontSize: 11, color: Colors.grey),
                          ),
                        ],
                      ),
                    ],
                  ),

                  // Center Nav Items (Desktop / Web Top Navigation Pills)
                  if (isDesktop)
                    Row(
                      children: navItems.asMap().entries.map((entry) {
                        final idx = entry.key;
                        final item = entry.value;
                        final isActive = _currentIndex == idx;

                        return Padding(
                          padding: const EdgeInsets.symmetric(horizontal: 4.0),
                          child: InkWell(
                            onTap: () => setState(() => _currentIndex = idx),
                            borderRadius: BorderRadius.circular(12),
                            child: AnimatedContainer(
                              duration: const Duration(milliseconds: 200),
                              padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 10),
                              decoration: BoxDecoration(
                                color: isActive
                                    ? const Color(0xFF2563EB).withValues(alpha: 0.25)
                                    : Colors.transparent,
                                borderRadius: BorderRadius.circular(12),
                                border: Border.all(
                                  color: isActive ? const Color(0xFF3B82F6).withValues(alpha: 0.5) : Colors.transparent,
                                ),
                              ),
                              child: Row(
                                children: [
                                  Icon(
                                    item['icon'] as IconData,
                                    size: 18,
                                    color: isActive ? const Color(0xFF60A5FA) : Colors.grey,
                                  ),
                                  const SizedBox(width: 8),
                                  Text(
                                    item['label'] as String,
                                    style: GoogleFonts.inter(
                                      fontSize: 14,
                                      fontWeight: isActive ? FontWeight.bold : FontWeight.w500,
                                      color: isActive ? Colors.white : Colors.grey,
                                    ),
                                  ),
                                ],
                              ),
                            ),
                          ),
                        );
                      }).toList(),
                    ),

                  // Right Actions (Google User Profile / Sign In / Theme)
                  Row(
                    children: [
                      if (user != null) ...[
                        Tooltip(
                          message: '${user.displayName ?? "User"}\n(${user.email ?? ""})',
                          child: Container(
                            width: 34,
                            height: 34,
                            decoration: BoxDecoration(
                              shape: BoxShape.circle,
                              border: Border.all(color: const Color(0xFF3B82F6), width: 2),
                              image: DecorationImage(
                                image: NetworkImage(user.photoURL ?? 'https://www.gravatar.com/avatar/?d=mp'),
                                fit: BoxFit.cover,
                              ),
                            ),
                          ),
                        ),
                        const SizedBox(width: 8),
                        IconButton(
                          icon: const Icon(LucideIcons.log_out, size: 18, color: Colors.grey),
                          onPressed: () => authService.signOut(),
                          tooltip: 'Sign Out',
                        ),
                      ] else ...[
                        ElevatedButton.icon(
                          style: ElevatedButton.styleFrom(
                            backgroundColor: const Color(0xFF2563EB),
                            foregroundColor: Colors.white,
                            padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 8),
                            shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(10)),
                          ),
                          onPressed: () async {
                            try {
                              await authService.signInWithGoogle();
                            } catch (e) {
                              if (context.mounted) {
                                ScaffoldMessenger.of(context).showSnackBar(
                                  SnackBar(content: Text('Sign in failed: $e'), backgroundColor: Colors.redAccent),
                                );
                              }
                            }
                          },
                          icon: const Icon(LucideIcons.log_in, size: 16),
                          label: Text('Sign in with Google', style: GoogleFonts.inter(fontSize: 13, fontWeight: FontWeight.w600)),
                        ),
                      ],
                      const SizedBox(width: 8),

                      // Theme Toggle Button
                      IconButton(
                        icon: Icon(
                          isDark ? LucideIcons.sun : LucideIcons.moon,
                          color: isDark ? const Color(0xFFF59E0B) : const Color(0xFF2563EB),
                          size: 20,
                        ),
                        onPressed: () => themeProvider.toggleTheme(),
                        tooltip: 'Toggle Theme',
                      ),
                    ],
                  ),
                ],
              ),
            ),
          ),
        ),
      ),
      body: IndexedStack(
        index: _currentIndex,
        children: screens,
      ),
      bottomNavigationBar: isDesktop
          ? null
          : BottomNavigationBar(
              currentIndex: _currentIndex,
              onTap: (idx) => setState(() => _currentIndex = idx),
              backgroundColor: isDark ? const Color(0xFF131B2E) : Colors.white,
              selectedItemColor: const Color(0xFF3B82F6),
              unselectedItemColor: Colors.grey,
              type: BottomNavigationBarType.fixed,
              items: const [
                BottomNavigationBarItem(
                  icon: Icon(LucideIcons.layout_dashboard),
                  label: 'Dashboard',
                ),
                BottomNavigationBarItem(
                  icon: Icon(LucideIcons.activity),
                  label: 'Power',
                ),
                BottomNavigationBarItem(
                  icon: Icon(LucideIcons.file_down),
                  label: 'Export',
                ),
                BottomNavigationBarItem(
                  icon: Icon(LucideIcons.settings),
                  label: 'Settings',
                ),
              ],
            ),
    );
  }
}
