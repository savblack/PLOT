import { lazy, Suspense, useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { APP_NAV_ITEMS, isActiveView, titleForView } from '../navigation.js';
import { useNotifications } from '../hooks/useNotifications.js';
import { APP_SHELL } from '../copy/appShell.js';
import { SETTINGS_VIEW } from '../copy/settingsView.js';
import { BROADCAST_GUIDE } from '@plot/core/copy/broadcastGuide.js';
import AppSidebar from './AppSidebar.jsx';
import {
  IconMenu, IconClose, IconSearch, IconArrowUp,
} from './navIcons.jsx';

/* ── SVG Icons ───────────────────────── */
/* Shared with AppSidebar — see ./navIcons.jsx. */

const FeedbackPanel = lazy(() => import('./SettingsView.jsx').then(module => ({ default: module.FeedbackPanel })));

// Every page remains reachable through the mobile menu.
const DRAWER_NAV_ITEMS = APP_NAV_ITEMS.filter(item => item.id !== 'search' && item.id !== 'settings');

export default function AppShell({ currentView, navigateTo, children, profile, user, panelOpen, onOpenSearch }) {
  const navigate = useNavigate();
  const [feedbackOpen, setFeedbackOpen] = useState(false);
  const [drawerOpen, setDrawerOpen] = useState(false);
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

  // Search is not a destination any more: the nav item and the header icon
  // open the palette over whatever is on screen. Everything else routes.
  const go = (id) => (id === 'search' ? onOpenSearch() : navigateTo(id));

  const handleNav = (id) => {
    go(id);
    closeDrawer();
  };

  const pageTitle = titleForView(currentView);
  const isOwnProfile = !!profile?.username && currentView === `u/${profile.username}`;

  // At sidebar widths there is no header at all — the brand, search and
  // notifications live in the sidebar, and the title moves into the content
  // column as .app-page-heading so it shares a left edge with the section
  // headers below it. Home's VIEW_TITLES entry is the brand ("PLOT"), which the
  // sidebar already shows, so prefer the nav item's own label here and fall
  // back to the shared titles.
  const isProfileView = (currentView || '').startsWith('u/');
  const desktopTitle = isProfileView
    ? (isOwnProfile ? APP_SHELL.profile : `@${currentView.slice(2)}`)
    : (APP_NAV_ITEMS.find(item => item.id === currentView)?.label ?? pageTitle);

  const pageSubtitle = currentView === 'settings' ? SETTINGS_VIEW.page.subtitle
    : currentView === 'guide' ? BROADCAST_GUIDE.subtitle : null;

  return (
    <div className={`app-shell${panelOpen ? ' panel-docked' : ''}`}>
      {/* ── Desktop sidebar ── */}
      {/* Rendered at every width and revealed by CSS at >=1024px, so there is
          no breakpoint state in JS to get out of step with the stylesheet. */}
      <AppSidebar
        currentView={currentView}
        profile={profile}
        user={user}
        unread={unread}
        onFeedback={() => user ? setFeedbackOpen(true) : navigate('/login')}
        onNavigate={go}
        onNavigateProfile={(username) => navigate(`/u/${username}`)}
      />

      {feedbackOpen && user && (
        <Suspense fallback={null}>
          <FeedbackPanel user={user} allTypes onClose={() => setFeedbackOpen(false)} />
        </Suspense>
      )}

      {/* ── Header ── */}
      <header className="app-header">
        <div className="header-start">
          <button
            type="button"
            className="icon-btn"
            onClick={openDrawer}
            aria-label={APP_SHELL.openMenu}
            aria-expanded={drawerOpen}
            aria-controls="app-nav-drawer"
          >
            <IconMenu />
            {unread > 0 && <span className="mobile-menu-unread" aria-label={`${unread} unread notifications`} />}
          </button>
        </div>

        <span className="app-page-title">{desktopTitle}</span>
        <div className="header-end">
          <button
            type="button"
            className="icon-btn"
            onClick={onOpenSearch}
            aria-label={APP_SHELL.openSearch}
            title={APP_SHELL.search}
          >
            <IconSearch />
          </button>
        </div>
      </header>

      {/* ── Main content ── */}
      <main className="app-main animate-in" ref={mainRef}>
        {/* The scroll container stays full-bleed so the header/tab-bar chrome
            and the scrollbar keep the viewport edges; the content itself rides
            in a centred column. */}
        <div className="app-main-inner">
          {/* Sidebar widths only — below them the header above carries the
              title and this is display: none. */}
          <h1 className={`app-page-heading${pageSubtitle ? ' app-page-heading--with-subtitle' : ''}`}>{desktopTitle}</h1>
          {pageSubtitle && <p className="app-page-subtitle">{pageSubtitle}</p>}
          {children}
        </div>
      </main>

      {/* ── Back to top ── */}
      <button
        type="button"
        className={`scroll-top-btn${showScrollTop ? ' visible' : ''}`}
        onClick={scrollToTop}
        aria-label={APP_SHELL.scrollToTop}
        aria-hidden={!showScrollTop}
        tabIndex={showScrollTop ? 0 : -1}
      >
        <IconArrowUp />
      </button>

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
          <span className="nav-drawer-logo-text">plot</span>
          <button type="button" className="icon-btn" onClick={closeDrawer} aria-label={APP_SHELL.closeMenu}>
            <IconClose />
          </button>
        </div>

        <nav className="nav-drawer-nav">
          {DRAWER_NAV_ITEMS.map(({ id, label }) => (
            <button
              key={id}
              type="button"
              className={`nav-drawer-item${isActiveView(currentView, id) ? ' active' : ''}`}
              onClick={() => handleNav(id)}
              aria-current={isActiveView(currentView, id) ? 'page' : undefined}
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
          {user && !DRAWER_NAV_ITEMS.some(item => item.id === 'notifications') && (
            <button type="button" className={`nav-drawer-item${currentView === 'notifications' ? ' active' : ''}`} onClick={() => handleNav('notifications')}>
              <span className="nav-drawer-label">{APP_SHELL.notifications}</span>
              {unread > 0 && <span className="mobile-notification-count">{unread}</span>}
            </button>
          )}
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
