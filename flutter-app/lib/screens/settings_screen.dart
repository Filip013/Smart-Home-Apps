import 'package:flutter/material.dart';
import 'package:flutter_lucide/flutter_lucide.dart';
import 'package:google_fonts/google_fonts.dart';
import 'package:provider/provider.dart';
import '../providers/home_provider.dart';
import '../providers/theme_provider.dart';
import '../services/settings_service.dart';

class SettingsScreen extends StatefulWidget {
  final SettingsService settingsService;

  const SettingsScreen({super.key, required this.settingsService});

  @override
  State<SettingsScreen> createState() => _SettingsScreenState();
}

class _SettingsScreenState extends State<SettingsScreen> {
  late TextEditingController _workerUrlController;
  late TextEditingController _authTokenController;
  late TextEditingController _deviceId1Controller;
  late TextEditingController _deviceName1Controller;
  late TextEditingController _deviceLoc1Controller;
  late TextEditingController _deviceId2Controller;
  late TextEditingController _deviceName2Controller;
  late TextEditingController _deviceLoc2Controller;
  late TextEditingController _powerDeviceIdController;
  late TextEditingController _powerDeviceNameController;
  late TextEditingController _powerDeviceLocController;
  late TextEditingController _tvBoxUrlController;
  late TextEditingController _firestoreUidController;
  late TextEditingController _clientIdController;
  late TextEditingController _clientSecretController;
  late TextEditingController _regionController;

  @override
  void initState() {
    super.initState();
    _workerUrlController = TextEditingController(text: widget.settingsService.workerUrl);
    _authTokenController = TextEditingController(text: widget.settingsService.authToken);
    _deviceId1Controller = TextEditingController(text: widget.settingsService.deviceId1);
    _deviceName1Controller = TextEditingController(text: widget.settingsService.deviceName1);
    _deviceLoc1Controller = TextEditingController(text: widget.settingsService.deviceLoc1);
    _deviceId2Controller = TextEditingController(text: widget.settingsService.deviceId2);
    _deviceName2Controller = TextEditingController(text: widget.settingsService.deviceName2);
    _deviceLoc2Controller = TextEditingController(text: widget.settingsService.deviceLoc2);
    _powerDeviceIdController = TextEditingController(text: widget.settingsService.powerDeviceId);
    _powerDeviceNameController = TextEditingController(text: widget.settingsService.powerDeviceName);
    _powerDeviceLocController = TextEditingController(text: widget.settingsService.powerDeviceLoc);
    _tvBoxUrlController = TextEditingController(text: widget.settingsService.tvBoxUrl);
    _firestoreUidController = TextEditingController(text: widget.settingsService.firestoreUserId);
    _clientIdController = TextEditingController(text: widget.settingsService.clientId);
    _clientSecretController = TextEditingController(text: widget.settingsService.clientSecret);
    _regionController = TextEditingController(text: widget.settingsService.region);
  }

  @override
  void dispose() {
    _workerUrlController.dispose();
    _authTokenController.dispose();
    _deviceId1Controller.dispose();
    _deviceName1Controller.dispose();
    _deviceLoc1Controller.dispose();
    _deviceId2Controller.dispose();
    _deviceName2Controller.dispose();
    _deviceLoc2Controller.dispose();
    _powerDeviceIdController.dispose();
    _powerDeviceNameController.dispose();
    _powerDeviceLocController.dispose();
    _tvBoxUrlController.dispose();
    _firestoreUidController.dispose();
    _clientIdController.dispose();
    _clientSecretController.dispose();
    _regionController.dispose();
    super.dispose();
  }

  Future<void> _save() async {
    await widget.settingsService.saveSettings(
      workerUrl: _workerUrlController.text,
      authToken: _authTokenController.text,
      deviceId1: _deviceId1Controller.text,
      deviceName1: _deviceName1Controller.text,
      deviceLoc1: _deviceLoc1Controller.text,
      deviceId2: _deviceId2Controller.text,
      deviceName2: _deviceName2Controller.text,
      deviceLoc2: _deviceLoc2Controller.text,
      powerDeviceId: _powerDeviceIdController.text,
      powerDeviceName: _powerDeviceNameController.text,
      powerDeviceLoc: _powerDeviceLocController.text,
      tvBoxUrl: _tvBoxUrlController.text,
      firestoreUserId: _firestoreUidController.text,
      clientId: _clientIdController.text,
      clientSecret: _clientSecretController.text,
      region: _regionController.text,
    );

    if (mounted) {
      Provider.of<HomeProvider>(context, listen: false).updateSettings(widget.settingsService);
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(
          content: Text('AetherSmart configuration saved successfully!'),
          backgroundColor: Color(0xFF10B981),
        ),
      );
    }
  }

  @override
  Widget build(BuildContext context) {
    final isDark = Provider.of<ThemeProvider>(context).isDarkMode;

    return Scaffold(
      body: SingleChildScrollView(
        padding: const EdgeInsets.all(20),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text(
              'AetherSmart Configuration',
              style: GoogleFonts.outfit(fontSize: 20, fontWeight: FontWeight.bold),
            ),
            const SizedBox(height: 20),

            _buildSectionHeader('Cloudflare Worker Gateway (BFF)'),
            const SizedBox(height: 12),
            _buildTextField(
              controller: _workerUrlController,
              label: 'Cloudflare Worker URL',
              icon: LucideIcons.cloud,
              isDark: isDark,
            ),
            const SizedBox(height: 16),
            _buildTextField(
              controller: _authTokenController,
              label: 'Authorization Bearer Token (AUTH_SECRET)',
              icon: LucideIcons.key,
              obscureText: true,
              isDark: isDark,
            ),
            const SizedBox(height: 24),

            _buildSectionHeader('Tuya Cloud Credentials (Tuya IoT Platform)'),
            const SizedBox(height: 12),
            _buildTextField(
              controller: _clientIdController,
              label: 'Client ID (Access ID / API Key)',
              icon: LucideIcons.key_round,
              isDark: isDark,
            ),
            const SizedBox(height: 12),
            _buildTextField(
              controller: _clientSecretController,
              label: 'Client Secret (Access Secret)',
              icon: LucideIcons.lock,
              obscureText: true,
              isDark: isDark,
            ),
            const SizedBox(height: 12),
            _buildTextField(
              controller: _regionController,
              label: 'Region (us / eu / eu-west / cn / in)',
              icon: LucideIcons.globe,
              isDark: isDark,
            ),
            const SizedBox(height: 24),

            _buildSectionHeader('Temperature Monitor 1 (Belgrade Sensor)'),
            const SizedBox(height: 12),
            _buildTextField(
              controller: _deviceId1Controller,
              label: 'Device ID',
              icon: LucideIcons.cpu,
              isDark: isDark,
            ),
            const SizedBox(height: 12),
            Row(
              children: [
                Expanded(
                  child: _buildTextField(
                    controller: _deviceName1Controller,
                    label: 'Name',
                    icon: LucideIcons.tag,
                    isDark: isDark,
                  ),
                ),
                const SizedBox(width: 12),
                Expanded(
                  child: _buildTextField(
                    controller: _deviceLoc1Controller,
                    label: 'Location',
                    icon: LucideIcons.map_pin,
                    isDark: isDark,
                  ),
                ),
              ],
            ),
            const SizedBox(height: 24),

            _buildSectionHeader('Temperature Monitor 2 (Vršac Sensor)'),
            const SizedBox(height: 12),
            _buildTextField(
              controller: _deviceId2Controller,
              label: 'Device ID',
              icon: LucideIcons.cpu,
              isDark: isDark,
            ),
            const SizedBox(height: 12),
            Row(
              children: [
                Expanded(
                  child: _buildTextField(
                    controller: _deviceName2Controller,
                    label: 'Name',
                    icon: LucideIcons.tag,
                    isDark: isDark,
                  ),
                ),
                const SizedBox(width: 12),
                Expanded(
                  child: _buildTextField(
                    controller: _deviceLoc2Controller,
                    label: 'Location',
                    icon: LucideIcons.map_pin,
                    isDark: isDark,
                  ),
                ),
              ],
            ),
            const SizedBox(height: 24),

            _buildSectionHeader('Smart Power Meter'),
            const SizedBox(height: 12),
            _buildTextField(
              controller: _powerDeviceIdController,
              label: 'Device ID',
              icon: LucideIcons.zap,
              isDark: isDark,
            ),
            const SizedBox(height: 12),
            Row(
              children: [
                Expanded(
                  child: _buildTextField(
                    controller: _powerDeviceNameController,
                    label: 'Name',
                    icon: LucideIcons.tag,
                    isDark: isDark,
                  ),
                ),
                const SizedBox(width: 12),
                Expanded(
                  child: _buildTextField(
                    controller: _powerDeviceLocController,
                    label: 'Location',
                    icon: LucideIcons.map_pin,
                    isDark: isDark,
                  ),
                ),
              ],
            ),
            const SizedBox(height: 24),

            _buildSectionHeader('Local TV Box Power Daemon'),
            const SizedBox(height: 12),
            _buildTextField(
              controller: _tvBoxUrlController,
              label: 'Local TV Box URL',
              icon: LucideIcons.server,
              isDark: isDark,
            ),
            const SizedBox(height: 24),

            ElevatedButton.icon(
              onPressed: _save,
              icon: const Icon(LucideIcons.save, size: 18),
              label: Text(
                'Save Configuration',
                style: GoogleFonts.outfit(fontWeight: FontWeight.bold),
              ),
              style: ElevatedButton.styleFrom(
                backgroundColor: const Color(0xFF6366F1),
                foregroundColor: Colors.white,
                minimumSize: const Size.fromHeight(50),
                shape: RoundedRectangleBorder(
                  borderRadius: BorderRadius.circular(12),
                ),
              ),
            ),
          ],
        ),
      ),
    );
  }

  Widget _buildSectionHeader(String title) {
    return Text(
      title,
      style: GoogleFonts.outfit(
        fontSize: 15,
        fontWeight: FontWeight.bold,
        color: const Color(0xFF818CF8),
      ),
    );
  }

  Widget _buildTextField({
    required TextEditingController controller,
    required String label,
    required IconData icon,
    bool obscureText = false,
    TextInputType keyboardType = TextInputType.text,
    required bool isDark,
  }) {
    return TextField(
      controller: controller,
      obscureText: obscureText,
      keyboardType: keyboardType,
      style: TextStyle(color: isDark ? Colors.white : const Color(0xFF0F172A)),
      decoration: InputDecoration(
        labelText: label,
        labelStyle: TextStyle(color: isDark ? Colors.white54 : Colors.black54),
        prefixIcon: Icon(icon, color: const Color(0xFF6366F1), size: 18),
        filled: true,
        fillColor: isDark ? const Color(0xFF131B2E) : Colors.white,
        enabledBorder: OutlineInputBorder(
          borderRadius: BorderRadius.circular(12),
          borderSide: BorderSide(color: isDark ? Colors.white10 : Colors.black12),
        ),
        focusedBorder: OutlineInputBorder(
          borderRadius: BorderRadius.circular(12),
          borderSide: const BorderSide(color: Color(0xFF6366F1), width: 1.5),
        ),
      ),
    );
  }
}
