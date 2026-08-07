import { useEffect, useState } from 'react';
import { auth, googleProvider } from '../utils/tuyaService';
import { signInWithPopup, GoogleAuthProvider } from 'firebase/auth';
import { Zap } from 'lucide-react';

export const DesktopAuth = () => {
  const [status, setStatus] = useState("Initializing Desktop Sign In...");
  const [errorMsg, setErrorMsg] = useState("");

  useEffect(() => {
    const getQueryParam = (param: string) => {
      const searchVal = new URLSearchParams(window.location.search).get(param);
      if (searchVal) return searchVal;
      const hash = window.location.hash;
      if (hash.includes('?')) {
        return new URLSearchParams(hash.split('?')[1]).get(param);
      }
      return null;
    };

    const source = getQueryParam('source');
    
    const performAuth = async () => {
      try {
        if (source === 'tauri') {
          setStatus("Opening Google Sign In popup...");
          googleProvider.setCustomParameters({ prompt: 'select_account' });
          const res = await signInWithPopup(auth, googleProvider);
          
          setStatus("Authorization received. Returning to app...");
          const credential = GoogleAuthProvider.credentialFromResult(res);
          const googleIdToken = credential?.idToken;
          
          if (!googleIdToken) {
            throw new Error("Could not extract Google OAuth ID token.");
          }
          
          // Redirect to local Rust auth server running in the Tauri app
          window.location.href = `http://127.0.0.1:51730/?token=${googleIdToken}`;
        } else {
          setStatus("Invalid Request Source");
        }
      } catch (err: any) {
        console.error("Desktop Auth Error:", err);
        setErrorMsg(err.message || "Authentication failed.");
      }
    };

    performAuth();
  }, []);

  return (
    <div 
      style={{ 
        height: '100vh', 
        display: 'flex', 
        alignItems: 'center', 
        justifyContent: 'center', 
        background: 'radial-gradient(circle at center, #0f1c3f 0%, var(--color-bg, #0b0f19) 100%)',
        padding: '24px',
        fontFamily: 'Inter, system-ui, sans-serif'
      }}
    >
      <div 
        style={{ 
          width: '100%', 
          maxWidth: '400px', 
          padding: '40px', 
          borderRadius: '24px', 
          textAlign: 'center',
          background: 'rgba(15, 23, 42, 0.75)',
          backdropFilter: 'blur(16px)',
          boxShadow: '0 20px 40px rgba(0, 0, 0, 0.4)',
          border: '1px solid rgba(255, 255, 255, 0.1)',
          color: '#f8fafc'
        }}
      >
        <div style={{ display: 'flex', justifyContent: 'center', marginBottom: '20px' }}>
          <div 
            style={{ 
              width: '56px', 
              height: '56px', 
              borderRadius: '16px', 
              background: 'linear-gradient(135deg, #6366f1, #8b5cf6)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              boxShadow: '0 0 25px rgba(99, 102, 241, 0.5)'
            }}
          >
            <Zap size={28} color="#ffffff" />
          </div>
        </div>

        <h1 style={{ fontSize: '22px', fontWeight: 700, margin: '0 0 8px 0' }}>
          Desktop Sign In
        </h1>

        {!errorMsg ? (
          <div>
            <p style={{ fontSize: '14px', color: '#94a3b8', margin: '0 0 16px 0' }}>
              {status}
            </p>
            <p style={{ fontSize: '12px', color: '#64748b' }}>
              Please do not close this browser window.
            </p>
          </div>
        ) : (
          <div style={{ padding: '12px', borderRadius: '12px', background: 'rgba(244, 63, 94, 0.1)', border: '1px solid rgba(244, 63, 94, 0.2)', color: '#fb7185', fontSize: '13px' }}>
            <span>{errorMsg}</span>
          </div>
        )}
      </div>
    </div>
  );
};
