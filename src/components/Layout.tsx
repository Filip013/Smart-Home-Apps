import React, { useState, useEffect } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { 
  Sun, 
  Moon, 
  LayoutDashboard, 
  Activity, 
  FileDown, 
  Menu, 
  X,
  Zap,
  Settings,
  LogOut
} from 'lucide-react';
import { auth, signOut } from '../utils/tuyaService';

interface LayoutProps {
  children: React.ReactNode;
}

export const Layout: React.FC<LayoutProps> = ({ children }) => {
  const location = useLocation();
  const [theme, setTheme] = useState<'dark' | 'light'>(() => {
    const ignoreSystem = localStorage.getItem('theme_ignore_system') === 'true';
    if (ignoreSystem) {
      const saved = localStorage.getItem('theme');
      return (saved as 'dark' | 'light') || 'dark';
    }
    const isSystemDark = window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches;
    return isSystemDark ? 'dark' : 'light';
  });
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  // Apply theme to document and listen to system theme / storage changes
  useEffect(() => {
    const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');

    const updateTheme = () => {
      const ignoreSystem = localStorage.getItem('theme_ignore_system') === 'true';
      let activeTheme: 'dark' | 'light' = 'dark';
      if (ignoreSystem) {
        const saved = localStorage.getItem('theme');
        activeTheme = (saved as 'dark' | 'light') || 'dark';
      } else {
        activeTheme = mediaQuery.matches ? 'dark' : 'light';
      }
      setTheme(activeTheme);
      document.documentElement.setAttribute('data-theme', activeTheme);
    };

    updateTheme();

    const handleSystemChange = () => {
      updateTheme();
    };

    const handleThemeEvent = () => {
      updateTheme();
    };

    if (mediaQuery.addEventListener) {
      mediaQuery.addEventListener('change', handleSystemChange);
    } else {
      mediaQuery.addListener(handleSystemChange);
    }

    window.addEventListener('storage', handleThemeEvent);
    window.addEventListener('theme_changed', handleThemeEvent);

    return () => {
      if (mediaQuery.removeEventListener) {
        mediaQuery.removeEventListener('change', handleSystemChange);
      } else {
        mediaQuery.removeListener(handleSystemChange);
      }
      window.removeEventListener('storage', handleThemeEvent);
      window.removeEventListener('theme_changed', handleThemeEvent);
    };
  }, []);

  const toggleTheme = () => {
    const nextTheme = theme === 'dark' ? 'light' : 'dark';
    localStorage.setItem('theme', nextTheme);
    localStorage.setItem('theme_ignore_system', 'true');
    setTheme(nextTheme);
    document.documentElement.setAttribute('data-theme', nextTheme);
    window.dispatchEvent(new Event('theme_changed'));
  };

  const navItems = [
    { path: '/', label: 'Dashboard', icon: LayoutDashboard },
    { path: '/power', label: 'Power & Climate', icon: Activity },
    { path: '/export', label: 'Export & Print', icon: FileDown },
    { path: '/settings', label: 'Settings', icon: Settings }
  ];

  return (
    <div className="app-container">
      {/* Header */}
      <header className="app-header glass">
        <div className="header-brand">
          <div className="brand-logo">
            <Zap className="logo-icon animate-pulse" />
          </div>
          <div className="brand-text">
            <h1>AetherSmart</h1>
            <span className="brand-subtitle">Smart Energy & Climate</span>
          </div>
        </div>

        {/* Desktop Navigation */}
        <nav className="desktop-nav">
          {navItems.map((item) => {
            const Icon = item.icon;
            const isActive = location.pathname === item.path;
            return (
              <Link
                key={item.path}
                id={`nav-link-${item.label.toLowerCase().replace(/\s+/g, '-')}`}
                to={item.path}
                className={`nav-link ${isActive ? 'active' : ''}`}
              >
                <Icon size={18} />
                <span>{item.label}</span>
              </Link>
            );
          })}
        </nav>

        {/* Theme and Menu Controls */}
        <div className="header-actions">
          {(() => {
            const user = auth.currentUser;
            return user && (
              <div className="user-profile" style={{ display: 'flex', alignItems: 'center', gap: '8px', marginRight: '8px' }}>
                <img 
                  src={user.photoURL || 'https://www.gravatar.com/avatar/?d=mp'} 
                  alt={user.displayName || 'User'} 
                  title={`${user.displayName} (${user.email})`}
                  style={{ width: '30px', height: '30px', borderRadius: '50%', border: '2px solid var(--color-primary)' }}
                />
                <button
                  id="btn-logout"
                  onClick={() => signOut()}
                  className="action-btn"
                  title="Sign Out"
                  aria-label="Sign Out"
                  style={{ width: '30px', height: '30px' }}
                >
                  <LogOut size={14} />
                </button>
              </div>
            );
          })()}
          <button 
            id="theme-toggle-btn"
            onClick={toggleTheme} 
            className="action-btn theme-toggle-btn"
            aria-label={`Switch to ${theme === 'dark' ? 'light' : 'dark'} mode`}
          >
            {theme === 'dark' ? <Sun size={20} className="text-warning" /> : <Moon size={20} className="text-primary" />}
          </button>
          
          <button 
            id="mobile-menu-toggle-btn"
            onClick={() => setMobileMenuOpen(!mobileMenuOpen)} 
            className="action-btn mobile-menu-btn"
            aria-label="Toggle Navigation Menu"
          >
            {mobileMenuOpen ? <X size={24} /> : <Menu size={24} />}
          </button>
        </div>
      </header>

      {/* Mobile Drawer Navigation */}
      {mobileMenuOpen && (
        <div className="mobile-nav-overlay" onClick={() => setMobileMenuOpen(false)}>
          <nav className="mobile-nav glass" onClick={(e) => e.stopPropagation()}>
            <div className="mobile-nav-header">
              <div className="brand-logo small">
                <Zap size={20} className="logo-icon" />
              </div>
              <span className="brand-title">AetherSmart</span>
              <button 
                id="mobile-menu-close-btn"
                onClick={() => setMobileMenuOpen(false)} 
                className="action-btn"
              >
                <X size={20} />
              </button>
            </div>
            
            <div className="mobile-nav-links">
              {navItems.map((item) => {
                const Icon = item.icon;
                const isActive = location.pathname === item.path;
                return (
                  <Link
                    key={item.path}
                    id={`mobile-nav-link-${item.label.toLowerCase().replace(/\s+/g, '-')}`}
                    to={item.path}
                    className={`mobile-nav-link ${isActive ? 'active' : ''}`}
                    onClick={() => setMobileMenuOpen(false)}
                  >
                    <Icon size={20} />
                    <span>{item.label}</span>
                  </Link>
                );
              })}
            </div>
          </nav>
        </div>
      )}

      {/* Main Layout Area */}
      <main className="main-content">
        {children}
      </main>

      {/* Footer */}
      <footer className="app-footer">
        <div className="footer-content">
          <p>© {new Date().getFullYear()} AetherSmart Systems. All rights reserved.</p>
          <div className="footer-status">
            <span className="status-dot online"></span>
            <span className="status-label">All Systems Operational</span>
          </div>
        </div>
      </footer>
    </div>
  );
};
