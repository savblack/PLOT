import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { PRIMARY_NAV_ITEMS, VIEW_TITLES } from '../navigation.js';
import { useNotifications } from '../hooks/useNotifications.js';
import ConfirmModal from './ConfirmModal.jsx';

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

function IconArrowUp() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <line x1="12" y1="19" x2="12" y2="5" />
      <polyline points="6 11 12 5 18 11" />
    </svg>
  );
}

export default function AppShell({ currentView, navigateTo, children, profile, user }) {
  const navigate = useNavigate();
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [confirmSignOut, setConfirmSignOut] = useState(false);
  const [showScrollTop, setShowScrollTop] = useState(false);
  const mainRef = useRef(null);

  const { unread, refreshCount } = useNotifications(user?.id);

  // Keep the bell badge fresh as the user navigates (e.g. after viewing the feed).
  useEffect(() => { refreshCount(); }, [currentView, refreshCount]);

  useEffect(() => {
    if (!drawerOpen) return undefined;

    const handleKeyDown = (event) => {
      if (event.key === 'Escape') setDrawerOpen(false);
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [drawerOpen]);

  // Show a "back to top" button once the main content has scrolled more than a
  // full screen — the point where scrolling back by hand becomes tedious. Tying
  // the threshold to the viewport height means short pages (that never scroll a
  // whole screen) never show it, so it only appears when it's actually needed.
  useEffect(() => {
    const el = mainRef.current;
    if (!el) return undefined;

    const handleScroll = () => setShowScrollTop(el.scrollTop > el.clientHeight);
    handleScroll();
    el.addEventListener('scroll', handleScroll, { passive: true });

    // Content height changes without a scroll event when switching sub-tabs
    // (Feed / Discover / Releases) or as data loads in — re-check then too.
    const observer = new ResizeObserver(handleScroll);
    observer.observe(el);
    if (el.firstElementChild) observer.observe(el.firstElementChild);

    return () => {
      el.removeEventListener('scroll', handleScroll);
      observer.disconnect();
    };
  }, [currentView]);

  const scrollToTop = () => {
    mainRef.current?.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const openDrawer  = () => setDrawerOpen(true);
  const closeDrawer = () => setDrawerOpen(false);

  const handleNav = (id) => {
    navigateTo(id);
    closeDrawer();
  };

  const handleSignOut = () => {
    closeDrawer();
    setConfirmSignOut(true);
  };

  const pageTitle = VIEW_TITLES[currentView] ?? 'PLOT';
  const showHomeLogo = currentView === 'home' || (currentView || '').startsWith('u/');

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
            <span className="app-header-logo-text">PLOT</span>
          </button>
        ) : (
          <span className="app-page-title">{pageTitle}</span>
        )}

        <div className="header-end">
          {user && (
          <button
            type="button"
            className="icon-btn"
            onClick={() => navigateTo('notifications')}
            aria-label={`Notifications${unread ? ` (${unread} unread)` : ''}`}
            title="Notifications"
            aria-current={currentView === 'notifications' ? 'page' : undefined}
            style={{ position: 'relative' }}
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ transform: 'translateY(8%) scale(0.92)' }}>
              <path d="M18 8a6 6 0 0 0-12 0c0 7-3 9-3 9h18s-3-2-3-9"/>
              <path d="M13.73 21a2 2 0 0 1-3.46 0"/>
            </svg>
            {unread > 0 && (
              <span aria-hidden="true" style={{
                position: 'absolute', top: 1, right: 1, minWidth: 16, height: 16, padding: '0 4px',
                borderRadius: 8, background: 'var(--accent)', color: '#fff', fontSize: 10,
                fontWeight: 700, lineHeight: '16px', textAlign: 'center',
              }}>{unread > 9 ? '9+' : unread}</span>
            )}
          </button>
          )}
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
      <main className="app-main animate-in" ref={mainRef}>
        {children}
      </main>

      {/* ── Back to top ── */}
      <button
        type="button"
        className={`scroll-top-btn${showScrollTop ? ' visible' : ''}`}
        onClick={scrollToTop}
        aria-label="Scroll to top"
        aria-hidden={!showScrollTop}
        tabIndex={showScrollTop ? 0 : -1}
      >
        <IconArrowUp />
      </button>

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
          <span className="nav-drawer-logo-text">PLOT</span>
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
          {profile?.username && (
            <button
              type="button"
              className="nav-drawer-item"
              onClick={() => { closeDrawer(); navigate(`/u/${profile.username}`); }}
            >
              <span className="nav-drawer-label">Profile</span>
            </button>
          )}
          <button
            type="button"
            className={`nav-drawer-item${currentView === 'notifications' ? ' active' : ''}`}
            onClick={() => handleNav('notifications')}
            aria-current={currentView === 'notifications' ? 'page' : undefined}
          >
            <span className="nav-drawer-label">Notifications</span>
          </button>
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
          <button
            type="button"
            className="nav-drawer-item nav-drawer-item--signout"
            onClick={handleSignOut}
          >
            <span className="nav-drawer-label">Sign out</span>
          </button>
        </div>
      </div>

      {confirmSignOut && (
        <ConfirmModal
          title="Sign out?"
          message="You can sign back in anytime."
          confirmLabel="Sign out"
          onConfirm={() => { navigate('/logout'); return true; }}
          onClose={() => setConfirmSignOut(false)}
        />
      )}
    </div>
  );
}
