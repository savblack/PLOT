import { useEffect, useState } from 'react';
import { PRIMARY_NAV_ITEMS, VIEW_TITLES } from '../navigation.js';
import PlotLogo from './PlotLogo.jsx';

/* ── SVG Icons ───────────────────────── */
function IconMenu() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
      <line x1="3" y1="6" x2="21" y2="6"/>
      <line x1="3" y1="12" x2="21" y2="12"/>
      <line x1="3" y1="18" x2="21" y2="18"/>
    </svg>
  );
}

function IconClose() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
      <line x1="18" y1="6" x2="6" y2="18"/>
      <line x1="6" y1="6" x2="18" y2="18"/>
    </svg>
  );
}

function IconSearch() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="11" cy="11" r="7" />
      <line x1="16.5" y1="16.5" x2="21" y2="21" />
    </svg>
  );
}

export default function AppShell({ currentView, navigateTo, children }) {
  const [drawerOpen, setDrawerOpen] = useState(false);

  useEffect(() => {
    if (!drawerOpen) return undefined;

    const handleKeyDown = (event) => {
      if (event.key === 'Escape') setDrawerOpen(false);
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [drawerOpen]);

  const openDrawer  = () => setDrawerOpen(true);
  const closeDrawer = () => setDrawerOpen(false);

  const handleNav = (id) => {
    navigateTo(id);
    closeDrawer();
  };

  const pageTitle = VIEW_TITLES[currentView] ?? 'PLOT';
  const showHomeLogo = currentView === 'home';

  return (
    <div className="app-shell">
      {/* ── Header ── */}
      <header className="app-header">
        <div className="header-start">
          <button
            type="button"
            className="icon-btn"
            onClick={openDrawer}
            aria-label="Open menu"
            aria-expanded={drawerOpen}
            aria-controls="app-nav-drawer"
          >
            <IconMenu />
          </button>
        </div>

        {showHomeLogo ? (
          <button
            type="button"
            className="app-header-logo"
            onClick={() => navigateTo('home')}
            aria-label="Go to home"
          >
            <PlotLogo className="app-header-logo-image" />
          </button>
        ) : (
          <span className="app-page-title">{pageTitle}</span>
        )}

        <div className="header-end">
          <button
            type="button"
            className="icon-btn"
            onClick={() => navigateTo('search')}
            aria-label="Open search"
            title="Search"
            aria-current={currentView === 'search' ? 'page' : undefined}
          >
            <IconSearch />
          </button>
        </div>
      </header>

      {/* ── Main content ── */}
      <main className="app-main animate-in">
        {children}
      </main>

      {/* ── Bottom tab bar ── */}
      <nav className="tab-bar">
        {PRIMARY_NAV_ITEMS.map(({ id, label }) => (
          <button
            key={id}
            type="button"
            className={`tab-btn${currentView === id ? ' active' : ''}`}
            onClick={() => navigateTo(id)}
            aria-current={currentView === id ? 'page' : undefined}
          >
            {label}
          </button>
        ))}
      </nav>

      {/* ── Nav Drawer ── */}
      {drawerOpen && (
        <div className="nav-drawer-overlay" onClick={closeDrawer} aria-hidden="true" />
      )}
      <div
        id="app-nav-drawer"
        className={`nav-drawer${drawerOpen ? ' open' : ''}`}
        aria-hidden={!drawerOpen}
      >
        <div className="nav-drawer-header">
          <PlotLogo className="nav-drawer-logo-image" />
          <button type="button" className="icon-btn" onClick={closeDrawer} aria-label="Close menu">
            <IconClose />
          </button>
        </div>

        <nav className="nav-drawer-nav">
          {PRIMARY_NAV_ITEMS.map(({ id, label }) => (
            <button
              key={id}
              type="button"
              className={`nav-drawer-item${currentView === id ? ' active' : ''}`}
              onClick={() => handleNav(id)}
              aria-current={currentView === id ? 'page' : undefined}
            >
              <span className="nav-drawer-label">{label}</span>
            </button>
          ))}
        </nav>

        <div className="nav-drawer-footer">
          <button
            type="button"
            className={`nav-drawer-item${currentView === 'settings' ? ' active' : ''}`}
            onClick={() => handleNav('settings')}
            aria-current={currentView === 'settings' ? 'page' : undefined}
          >
            <span className="nav-drawer-label">Settings</span>
          </button>
        </div>
      </div>
    </div>
  );
}
