import { useState, useEffect } from 'react';
import { HashRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import { onAuthStateChanged, auth, signInWithGoogle } from './utils/tuyaService';
import type { User } from 'firebase/auth';
import { Layout } from './components/Layout';
import { Dashboard } from './pages/Dashboard';
import { PowerDetails } from './pages/PowerDetails';
import { ExportPrint } from './pages/ExportPrint';
import { Settings } from './pages/Settings';
import { Zap } from 'lucide-react';
import './index.css';

function App() {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [authError, setAuthError] = useState('');

  useEffect(() => {
    // Listen to Firebase Auth state shifts
    const unsubscribe = onAuthStateChanged(auth, (currentUser) => {
      setUser(currentUser);
      setLoading(false);
    });
    return () => unsubscribe();
  }, []);

  const handleLogin = async () => {
    setLoading(true);
    setAuthError('');
    try {
      await signInWithGoogle();
    } catch (e: any) {
      console.error(e);
      setAuthError(e.message || 'Authentication failed. Please try again.');
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="loading-screen" style={{ height: '100vh', backgroundColor: 'var(--color-bg)' }}>
        <Zap className="animate-spin text-primary" size={56} style={{ filter: 'drop-shadow(0 0 10px var(--color-primary))' }} />
        <p style={{ fontFamily: 'Outfit', fontWeight: 600, color: 'var(--color-text)', marginTop: '12px' }}>
          Authorizing connection...
        </p>
      </div>
    );
  }

  // Render Login view if user is unauthenticated
  if (!user) {
    return (
      <div 
        className="login-container animate-fade-in" 
        style={{ 
          height: '100vh', 
          display: 'flex', 
          alignItems: 'center', 
          justifyContent: 'center', 
          background: 'radial-gradient(circle at center, #0f1c3f 0%, var(--color-bg) 100%)',
          padding: '24px'
        }}
      >
        <div 
          className="login-card glass" 
          style={{ 
            width: '100%', 
            maxWidth: '420px', 
            padding: '40px', 
            borderRadius: 'var(--radius-lg)', 
            textAlign: 'center',
            display: 'flex',
            flexDirection: 'column',
            gap: '24px',
            boxShadow: '0 20px 40px rgba(0, 0, 0, 0.4)',
            border: '1px solid rgba(255, 255, 255, 0.1)'
          }}
        >
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '12px' }}>
            <div 
              style={{ 
                width: '64px', 
                height: '64px', 
                borderRadius: '16px', 
                background: 'linear-gradient(135deg, var(--color-primary), var(--color-accent))',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                boxShadow: '0 0 25px rgba(99, 102, 241, 0.5)'
              }}
            >
              <Zap size={32} className="text-white animate-pulse" />
            </div>
            <div>
              <h1 style={{ fontFamily: 'Outfit', fontSize: '28px', fontWeight: 800, color: 'var(--color-text)', margin: '4px 0 0 0' }}>
                AetherSmart
              </h1>
              <span style={{ fontSize: '13px', color: 'var(--color-text-muted)', textTransform: 'uppercase', letterSpacing: '0.1em' }}>
                Energy & Climate Gateway
              </span>
            </div>
          </div>

          <p style={{ fontSize: '14px', color: 'var(--color-text-muted)', lineHeight: '1.6' }}>
            Access real-time power meter metrics, climate sensors, and generate ink-friendly summaries by signing in.
          </p>

          <button
            id="google-signin-btn"
            onClick={handleLogin}
            className="btn primary"
            style={{ 
              display: 'flex', 
              alignItems: 'center', 
              justifyContent: 'center', 
              gap: '12px',
              padding: '12px 24px',
              fontSize: '15px',
              fontWeight: 700,
              cursor: 'pointer',
              boxShadow: 'var(--glow-primary)',
              borderRadius: 'var(--radius-md)'
            }}
          >
            {/* Inline Google SVG Logo */}
            <svg width="18" height="18" viewBox="0 0 18 18">
              <path
                fill="#ffffff"
                d="M17.64 9.2c0-.63-.06-1.25-.16-1.84H9v3.47h4.84c-.21 1.12-.84 2.07-1.79 2.7l2.79 2.16c1.63-1.51 2.57-3.73 2.57-6.39z"
              />
              <path
                fill="#ffffff"
                d="M9 18c2.43 0 4.47-.8 5.96-2.18l-2.79-2.16c-.78.52-1.78.83-2.96.83-2.28 0-4.21-1.54-4.9-3.61L1.4 13.06C2.88 16 5.94 18 9 18z"
              />
              <path
                fill="#ffffff"
                d="M4.1 10.88A5.4 5.4 0 0 1 3.8 9c0-.65.11-1.29.3-1.88L1.4 5.25A8.996 8.996 0 0 0 0 9c0 1.54.39 3.01 1.09 4.31l3.01-2.43z"
              />
              <path
                fill="#ffffff"
                d="M9 3.58c1.32 0 2.5.45 3.44 1.35L15 2.4C13.47.98 11.43 0 9 0 5.94 0 2.88 2 1.4 4.94L4.4 7.37C5.09 5.3 7.02 3.58 9 3.58z"
              />
            </svg>
            <span>Sign in with Google</span>
          </button>

          {authError && (
            <div className="alert-banner warning" style={{ backgroundColor: 'rgba(244, 63, 94, 0.1)', borderColor: 'rgba(244, 63, 94, 0.2)', color: 'var(--color-danger)', fontSize: '12px' }}>
              <span>{authError}</span>
            </div>
          )}
        </div>
      </div>
    );
  }

  // Load router views if logged in
  return (
    <Router>
      <Layout>
        <Routes>
          <Route path="/" element={<Dashboard />} />
          <Route path="/power" element={<PowerDetails />} />
          <Route path="/export" element={<ExportPrint />} />
          <Route path="/settings" element={<Settings />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </Layout>
    </Router>
  );
}

export default App;
