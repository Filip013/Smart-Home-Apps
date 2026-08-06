import 'package:flutter/material.dart';

class ThemeProvider extends ChangeNotifier {
  /// Follows the system by default. The manual toggle sets an explicit
  /// light/dark override that lasts until the system brightness changes,
  /// then we follow the system again.
  ThemeMode _themeMode = ThemeMode.system;

  ThemeMode get themeMode => _themeMode;

  /// Resolved brightness: manual override wins, otherwise the system.
  bool get isDarkMode {
    switch (_themeMode) {
      case ThemeMode.dark:
        return true;
      case ThemeMode.light:
        return false;
      case ThemeMode.system:
        return WidgetsBinding.instance.platformDispatcher.platformBrightness ==
            Brightness.dark;
    }
  }

  ThemeProvider() {
    WidgetsBinding.instance.platformDispatcher.onPlatformBrightnessChanged =
        _onSystemBrightnessChanged;
  }

  void _onSystemBrightnessChanged() {
    // Clear any manual override when the system theme changes.
    if (_themeMode != ThemeMode.system) {
      _themeMode = ThemeMode.system;
      notifyListeners();
    }
  }

  void toggleTheme() {
    _themeMode = isDarkMode ? ThemeMode.light : ThemeMode.dark;
    notifyListeners();
  }

  void setThemeMode(ThemeMode mode) {
    _themeMode = mode;
    notifyListeners();
  }

  static ThemeData get darkTheme {
    return ThemeData.dark().copyWith(
      scaffoldBackgroundColor: const Color(0xFF0F172A),
      cardColor: const Color(0xFF1E293B),
      appBarTheme: const AppBarTheme(
        backgroundColor: Color(0xFF1E293B),
        elevation: 0,
      ),
      colorScheme: const ColorScheme.dark(
        primary: Color(0xFF3B82F6),
        secondary: Color(0xFFF59E0B),
        surface: Color(0xFF1E293B),
      ),
    );
  }

  static ThemeData get lightTheme {
    return ThemeData.light().copyWith(
      scaffoldBackgroundColor: const Color(0xFFF8FAFC),
      cardColor: Colors.white,
      appBarTheme: const AppBarTheme(
        backgroundColor: Colors.white,
        elevation: 1,
        iconTheme: IconThemeData(color: Color(0xFF0F172A)),
        titleTextStyle: TextStyle(color: Color(0xFF0F172A)),
      ),
      colorScheme: const ColorScheme.light(
        primary: Color(0xFF2563EB),
        secondary: Color(0xFFD97706),
        surface: Colors.white,
      ),
    );
  }
}
