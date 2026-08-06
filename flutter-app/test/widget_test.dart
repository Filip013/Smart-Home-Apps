import 'package:flutter_test/flutter_test.dart';
import 'package:provider/provider.dart';
import 'package:shared_preferences/shared_preferences.dart';
import 'package:smart_home_flutter/main.dart';
import 'package:smart_home_flutter/providers/home_provider.dart';
import 'package:smart_home_flutter/providers/theme_provider.dart';
import 'package:smart_home_flutter/services/auth_service.dart';
import 'package:smart_home_flutter/services/settings_service.dart';

void main() {
  testWidgets('SmartHomeApp smoke test', (WidgetTester tester) async {
    SharedPreferences.setMockInitialValues({});
    final settingsService = await SettingsService.init();
    await tester.pumpWidget(
      MultiProvider(
        providers: [
          ChangeNotifierProvider(create: (_) => ThemeProvider()),
          ChangeNotifierProvider(create: (_) => AuthService()),
          ChangeNotifierProvider(create: (_) => HomeProvider(settingsService: settingsService)),
        ],
        child: SmartHomeApp(settingsService: settingsService),
      ),
    );
  });
}
