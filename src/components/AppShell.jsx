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

function IconGuide()    { return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M3 11L12 3l9 8"/><path d="M5 9.5V20a1 1 0 0 0 1 1h4v-5h4v5h4a1 1 0 0 0 1-1V9.5"/></svg>; }
function IconCalendar() { return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>; }
function IconWatchlist(){ return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z"/></svg>; }
function IconHistory()  { return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"/><path d="M3 3v5h5"/><path d="M12 7v5l4 2"/></svg>; }
function IconSearch()   { return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>; }
function IconLists()    { return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><line x1="8" y1="6" x2="21" y2="6"/><line x1="8" y1="12" x2="21" y2="12"/><line x1="8" y1="18" x2="21" y2="18"/><line x1="3" y1="6" x2="3.01" y2="6"/><line x1="3" y1="12" x2="3.01" y2="12"/><line x1="3" y1="18" x2="3.01" y2="18"/></svg>; }
function IconSettings() { return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg>; }

const TABS = [
  { id: 'home',     label: 'Home'     },
  { id: 'calendar', label: 'Calendar' },
  { id: 'my-lists', label: 'My Lists' },
  { id: 'history',  label: 'History'  },
  { id: 'search',   label: 'Search'   },
];

const NAV_ITEMS = [
  { id: 'home',     label: 'Home',     Icon: IconGuide    },
  { id: 'calendar', label: 'Calendar', Icon: IconCalendar },
  { id: 'my-lists', label: 'My Lists', Icon: IconLists    },
  { id: 'history',  label: 'History',  Icon: IconHistory  },
  { id: 'search',   label: 'Search',   Icon: IconSearch   },
];

const VIEW_TITLES = {
  home:       'PLOT',
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
          {NAV_ITEMS.map(({ id, label, Icon }) => (
            <button
              key={id}
              className={`nav-drawer-item${currentView === id ? ' active' : ''}`}
              onClick={() => handleNav(id)}
            >
              <span className="nav-drawer-icon"><Icon /></span>
              <span className="nav-drawer-label">{label}</span>
            </button>
          ))}
        </nav>

        <div className="nav-drawer-footer">
          <button
            className={`nav-drawer-item${currentView === 'settings' ? ' active' : ''}`}
            onClick={() => handleNav('settings')}
          >
            <span className="nav-drawer-icon"><IconSettings /></span>
            <span className="nav-drawer-label">Settings</span>
          </button>
        </div>
      </div>
    </div>
  );
}
