import 'package:firebase_core/firebase_core.dart';
import 'package:firebase_auth/firebase_auth.dart';
import 'package:flutter/foundation.dart';
import 'package:flutter/services.dart';

class AuthService extends ChangeNotifier {
  static const FirebaseOptions _firebaseOptions = FirebaseOptions(
    apiKey: "AIzaSyC4FcjFosdCMxWnPAeMe_ObZPDShnHZy2E",
    authDomain: "gen-lang-client-0142372615.firebaseapp.com",
    projectId: "gen-lang-client-0142372615",
    storageBucket: "gen-lang-client-0142372615.firebasestorage.app",
    messagingSenderId: "115950049911",
    appId: "1:115950049911:web:24f61e62fe5602dcc78472",
    measurementId: "G-GWRHMX8RE5",
  );

  static FirebaseApp? _app;
  FirebaseAuth? _auth;
  User? _currentUser;
  bool _isInitializing = true;

  User? get currentUser => _currentUser;
  bool get isSignedIn => _currentUser != null;
  bool get isInitializing => _isInitializing;
  String? get userUid => _currentUser?.uid;

  AuthService() {
    _init();
  }

  static Future<FirebaseApp?> initializeFirebase() async {
    if (_app != null) return _app!;
    try {
      if (Firebase.apps.isNotEmpty) {
        _app = Firebase.apps.first;
        return _app;
      }
      _app = await Firebase.initializeApp(options: _firebaseOptions);
      return _app;
    } catch (e) {
      debugPrint('Firebase.initializeApp warning: $e');
      return null;
    }
  }

  void _init() async {
    try {
      final app = await initializeFirebase();
      if (app != null) {
        _auth = FirebaseAuth.instanceFor(app: app);
        _currentUser = _auth?.currentUser;
        _auth?.authStateChanges().listen((User? user) {
          _currentUser = user;
          _isInitializing = false;
          notifyListeners();
        });
      } else {
        _isInitializing = false;
        notifyListeners();
      }
    } catch (e) {
      debugPrint('Auth listener init error: $e');
      _isInitializing = false;
      notifyListeners();
    }
  }

  Future<UserCredential?> signInWithGoogle() async {
    try {
      final app = await initializeFirebase();
      final auth = app != null ? FirebaseAuth.instanceFor(app: app) : FirebaseAuth.instance;
      final GoogleAuthProvider googleProvider = GoogleAuthProvider();
      googleProvider.setCustomParameters({'prompt': 'select_account'});

      if (kIsWeb) {
        return await auth.signInWithPopup(googleProvider);
      } else {
        return await auth.signInWithProvider(googleProvider);
      }
    } on PlatformException catch (pe) {
      debugPrint('PlatformException in Google Sign-In: ${pe.message}');
      rethrow;
    } catch (e) {
      debugPrint('Google Sign-In Error: $e');
      rethrow;
    }
  }

  Future<void> signOut() async {
    try {
      if (_auth != null) {
        await _auth!.signOut();
      } else {
        final app = await initializeFirebase();
        if (app != null) {
          await FirebaseAuth.instanceFor(app: app).signOut();
        }
      }
      _currentUser = null;
      notifyListeners();
    } catch (e) {
      debugPrint('Sign Out Error: $e');
    }
  }
}
