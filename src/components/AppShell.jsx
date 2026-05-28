import { useState } from 'react';

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

const TABS = [
  { id: 'home',     label: 'Home'     },
  { id: 'calendar', label: 'Calendar' },
  { id: 'my-lists', label: 'My Lists' },
  { id: 'history',  label: 'History'  },
  { id: 'search',   label: 'Search'   },
];

const NAV_ITEMS = [
  { id: 'home',     label: 'Home'     },
  { id: 'calendar', label: 'Calendar' },
  { id: 'my-lists', label: 'My Lists' },
  { id: 'history',  label: 'History'  },
  { id: 'search',   label: 'Search'   },
];

const VIEW_TITLES = {
  home:       'PLOT',
  guide:      'Guide',
  calendar:   'Calendar',
  'my-lists': 'My Lists',
  history:    'History',
  search:     'Search',
  settings:   'Settings',
};

export default function AppShell({ currentView, navigateTo, children }) {
  const [drawerOpen, setDrawerOpen] = useState(false);

  const openDrawer  = () => setDrawerOpen(true);
  const closeDrawer = () => setDrawerOpen(false);

  const handleNav = (id) => {
    navigateTo(id);
    closeDrawer();
  };

  const pageTitle = VIEW_TITLES[currentView] ?? 'PLOT';

  return (
    <div className="app-shell">
      {/* ── Header ── */}
      <header className="app-header">
        <span className="app-page-title">{pageTitle}</span>

        <div className="header-end">
          <button
            className="icon-btn"
            onClick={openDrawer}
            aria-label="Open menu"
          >
            <IconMenu />
          </button>
        </div>
      </header>

      {/* ── Main content ── */}
      <main className="app-main animate-in">
        {children}
      </main>

      {/* ── Bottom tab bar ── */}
      <nav className="tab-bar">
        {TABS.map(({ id, label }) => (
          <button
            key={id}
            className={`tab-btn${currentView === id ? ' active' : ''}`}
            onClick={() => navigateTo(id)}
          >
            {label}
          </button>
        ))}
      </nav>

      {/* ── Nav Drawer ── */}
      {drawerOpen && (
        <div className="nav-drawer-overlay" onClick={closeDrawer} />
      )}
      <div className={`nav-drawer${drawerOpen ? ' open' : ''}`}>
        <div className="nav-drawer-header">
          <span className="nav-drawer-logo">PLOT</span>
          <button className="icon-btn" onClick={closeDrawer} aria-label="Close menu">
            <IconClose />
          </button>
        </div>

        <nav className="nav-drawer-nav">
          {NAV_ITEMS.map(({ id, label }) => (
            <button
              key={id}
              className={`nav-drawer-item${currentView === id ? ' active' : ''}`}
              onClick={() => handleNav(id)}
            >
              <span className="nav-drawer-label">{label}</span>
            </button>
          ))}
        </nav>

        <div className="nav-drawer-footer">
          <button
            className={`nav-drawer-item${currentView === 'settings' ? ' active' : ''}`}
            onClick={() => handleNav('settings')}
          >
            <span className="nav-drawer-label">Settings</span>
          </button>
        </div>
      </div>
    </div>
  );
}
