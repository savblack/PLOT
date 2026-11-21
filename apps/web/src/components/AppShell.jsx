import { lazy, Suspense, useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { preloadAppViews } from '../routeChunks.js';
import { APP_NAV_ITEMS, isActiveView, isMoreView, sidebarNavItems, titleForView } from '../navigation.js';
import { useNotifications } from '../hooks/useNotifications.js';
import { APP_SHELL } from '../copy/appShell.js';
import { SETTINGS_VIEW } from '../copy/settingsView.js';
import { isPremiumProfile } from '@plot/core/premium.js';
import AppSidebar from './AppSidebar.jsx';
import AccountMenu from './AccountMenu.jsx';
import GoPremiumLink from './GoPremiumLink.jsx';
import UpgradeSheet from './UpgradeSheet.jsx';
import ConfirmModal from './ConfirmModal.jsx';
import PremiumTrialPrompt from './PremiumTrialPrompt.jsx';
import { useApp } from '../hooks/useApp.js';
import {
  IconMenu, IconClose, IconSearch, IconArrowUp, IconBell, IconSettings, NAV_ICONS,
} from './navIcons.jsx';
import PlotLogo from './PlotLogo.jsx';

/* ── SVG Icons ───────────────────────── */
/* Shared with AppSidebar — see ./navIcons.jsx. */

const FeedbackPanel = lazy(() => import('./SettingsView.jsx').then(module => ({ default: module.FeedbackPanel })));

// Phones get a bottom tab bar: the four everyday places (the same primary
// items the mobile app's tab bar uses) and More. More opens the menu, which
// holds everything that is not a tab, in the order saved for the sidebar.
// Before this, every move between Home and Calendar was two taps through a
// menu button, and the menu ignored the saved order (design audit pick 1.4 A).
const TAB_ITEMS = APP_NAV_ITEMS.filter(item => item.primary);
const menuItems = (order, region) => sidebarNavItems(order, region).filter(item => !item.primary && item.id !== 'search');

export default function AppShell({ currentView, navigateTo, children, profile, user, panelOpen, onOpenSearch }) {
  const navigate = useNavigate();
  const [feedbackOpen, setFeedbackOpen] = useState(false);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(() => {
    try { return window.localStorage.getItem('plot-sidebar-collapsed') === 'true'; }
    catch { return false; }
  });
  const [showScrollTop, setShowScrollTop] = useState(false);
  const mainRef = useRef(null);

  const { unread, refreshCount } = useNotifications(user?.id);
  const { themeMode, themeFamily, setThemeMode, setThemeFamily, uiPrefs } = useApp() ?? {};
  // Sign out asks first from every place the shell offers it, as Settings and
  // the iPhone app do. /logout itself stays a direct link.
  const [confirmSignOut, setConfirmSignOut] = useState(false);
  const [themeUpgrade, setThemeUpgrade] = useState(null); // Premium family a Free viewer tapped in the account menu

  // Warm the other pages' chunks while idle so navigating doesn't wait on them.
  useEffect(() => { preloadAppViews(); }, []);

  // Keep the bell badge fresh as the user navigates (e.g. after viewing the feed).
  useEffect(() => { refreshCount(); }, [currentView, refreshCount]);

  useEffect(() => {
    try { window.localStorage.setItem('plot-sidebar-collapsed', String(sidebarCollapsed)); }
    catch { /* Storage can be unavailable in private browsing. */ }
  }, [sidebarCollapsed]);

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
  const isListDetail = currentView?.startsWith('my-lists/');

  // At sidebar widths there is no header at all — the brand, search and
  // notifications live in the sidebar. The title is still the page's h1
  // (.app-page-heading), but visually hidden there: the sidebar's active row
  // names the page, so the content starts at the top. Home's VIEW_TITLES
  // entry is the brand ("Plot"), which the sidebar already shows, so prefer
  // the nav item's own label here and fall back to the shared titles.
  //
  // Profile sub-pages (u/:username/compare, /history, ...) keep the handle as
  // their title: the page under it names the section. Taking only the second
  // segment stops the rest of the path leaking in as "@savannah/compare".
  const isProfileView = (currentView || '').startsWith('u/');
  const profileHandle = isProfileView ? currentView.split('/')[1] : null;
  // The drawer's profile row reads as selected on the viewer's own profile
  // and on Settings, as the desktop rail's does.
  const accountActive = (!!profile?.username && currentView === `u/${profile.username}`) || isActiveView(currentView, 'settings');
  const desktopTitle = isProfileView
    ? (profile?.username && profileHandle === profile.username ? APP_SHELL.profile : `@${profileHandle}`)
    : (APP_NAV_ITEMS.find(item => item.id === currentView)?.label ?? pageTitle);

  return (
    <div className={`app-shell${panelOpen ? ' panel-docked' : ''}${sidebarCollapsed ? ' sidebar-collapsed' : ''}`}>
      {/* ── Desktop sidebar ── */}
      {/* Rendered at every width and revealed by CSS at >=1024px, so there is
          no breakpoint state in JS to get out of step with the stylesheet. */}
      <AppSidebar
        currentView={currentView}
        profile={profile}
        user={user}
        unread={unread}
        collapsed={sidebarCollapsed}
        sidebarOrder={uiPrefs?.prefs.sidebar}
        onToggleCollapsed={() => setSidebarCollapsed(collapsed => !collapsed)}
        onFeedback={() => user ? setFeedbackOpen(true) : navigate('/login')}
        onSignOut={() => setConfirmSignOut(true)}
        onNavigate={go}
        onNavigateProfile={(username) => navigate(`/u/${username}`)}
        themeMode={themeMode}
        themeFamily={themeFamily}
        onPickMode={setThemeMode}
        onPickFamily={setThemeFamily}
        onThemeLocked={setThemeUpgrade}
      />
      {confirmSignOut && (
        <ConfirmModal
          title={SETTINGS_VIEW.page.signOutTitle}
          message={SETTINGS_VIEW.page.signOutMessage}
          confirmLabel={SETTINGS_VIEW.signOut}
          onConfirm={() => { navigate('/logout'); return true; }}
          onClose={() => setConfirmSignOut(false)}
        />
      )}
      {themeUpgrade && <UpgradeSheet reason="themes" family={themeUpgrade} onClose={() => setThemeUpgrade(null)} />}
      {/* Once, after onboarding or a Trakt import: the 7-day trial offer. */}
      {user && <PremiumTrialPrompt profile={profile} currentView={currentView} />}

      {feedbackOpen && user && (
        <Suspense fallback={null}>
          <FeedbackPanel user={user} allTypes onClose={() => setFeedbackOpen(false)} />
        </Suspense>
      )}

      {/* ── Header ── */}
      <header className="app-header">
        {/* Empty on purpose: the menu button moved to the tab bar's More. The
            slot stays so the title keeps its centre. */}
        <div className="header-start" />

        {!isListDetail && <span className="app-page-title">{desktopTitle}</span>}
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
          {/* Sidebar widths only, and for screen readers only — below them
              the header above carries the title and this is display: none. */}
          {!isListDetail && <h1 className="app-page-heading">{desktopTitle}</h1>}
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
          <span className="nav-drawer-logo-text"><PlotLogo inherit /></span>
          <button type="button" className="icon-btn" onClick={closeDrawer} aria-label={APP_SHELL.closeMenu}>
            <IconClose />
          </button>
        </div>

        <nav className="nav-drawer-nav">
          {menuItems(uiPrefs?.prefs.sidebar, profile?.region).map(({ id, label }) => {
            const Icon = NAV_ICONS[id];
            return (
              <button
                key={id}
                type="button"
                className={`nav-drawer-item${isActiveView(currentView, id) ? ' active' : ''}`}
                onClick={() => handleNav(id)}
                aria-current={isActiveView(currentView, id) ? 'page' : undefined}
              >
                {Icon && <Icon />}
                <span className="nav-drawer-label">{label}</span>
              </button>
            );
          })}
          {user && (
            <button type="button" className={`nav-drawer-item${currentView === 'notifications' ? ' active' : ''}`} onClick={() => handleNav('notifications')}>
              <IconBell />
              <span className="nav-drawer-label">{APP_SHELL.notifications}</span>
              {unread > 0 && <span className="mobile-notification-count">{unread}</span>}
            </button>
          )}
        </nav>

        {/* Foot, as on the desktop rail and in the mobile app's drawer: the
            profile row opens the account menu, which holds the theme controls,
            the account links, Help build Plot and Sign out. A viewer with no
            profile yet keeps the plain rows. */}
        {profile?.username ? (
          <div className="nav-drawer-footer nav-drawer-footer--account">
            {/* Go Premium: the pink side-nav chip for a Free member, read only
                while the drawer is open. */}
            {drawerOpen && !isPremiumProfile(profile) && (
              <GoPremiumLink profile={profile} placement="side_nav" variant="chip" className="app-sidebar-item" labelClassName="app-sidebar-label" onBeforeNavigate={closeDrawer} />
            )}
            <AccountMenu
              profile={profile}
              active={accountActive}
              current={accountActive}
              settingsLabel={SETTINGS_VIEW.page.title}
              onViewProfile={() => { closeDrawer(); navigate(`/u/${profile.username}`); }}
              onSettings={() => handleNav('settings')}
              onFeedback={() => { closeDrawer(); setFeedbackOpen(true); }}
              onSignOut={() => { closeDrawer(); setConfirmSignOut(true); }}
              mode={themeMode}
              family={themeFamily}
              onPickMode={setThemeMode}
              onPickFamily={setThemeFamily}
              isPremium={isPremiumProfile(profile)}
              onLocked={(family) => { closeDrawer(); setThemeUpgrade(family); }}
            />
          </div>
        ) : (
          <div className="nav-drawer-footer">
            <button
              type="button"
              className={`nav-drawer-item${currentView === 'settings' ? ' active' : ''}`}
              onClick={() => handleNav('settings')}
              aria-current={currentView === 'settings' ? 'page' : undefined}
            >
              <IconSettings />
              <span className="nav-drawer-label">{SETTINGS_VIEW.page.title}</span>
            </button>
            {user && (
              <button type="button" className="nav-drawer-item nav-drawer-item--text" onClick={() => { closeDrawer(); setFeedbackOpen(true); }}>
                <span className="nav-drawer-label">{APP_SHELL.giveFeedback}</span>
              </button>
            )}
            {user && (
              <button type="button" className="nav-drawer-item nav-drawer-item--text nav-drawer-item--signout" onClick={() => { closeDrawer(); setConfirmSignOut(true); }}>
                <span className="nav-drawer-label">{SETTINGS_VIEW.signOut}</span>
              </button>
            )}
          </div>
        )}
      </div>

      {/* ── Tab bar (phones and tablets; the sidebar replaces it when wide) ── */}
      <nav className="app-tabbar" aria-label={APP_SHELL.tabBar}>
        {/* Labelled (Nov 20): icons alone left first-timers guessing. The
            visible word is the button's name, so no aria-label is needed. */}
        {TAB_ITEMS.map(({ id, label }) => {
          const Icon = NAV_ICONS[id];
          const active = isActiveView(currentView, id);
          return (
            <button key={id} type="button" className={`app-tab${active ? ' active' : ''}`} onClick={() => go(id)} aria-current={active ? 'page' : undefined}>
              {Icon && <Icon />}
              <span className="app-tab-label">{label}</span>
            </button>
          );
        })}
        {/* More is lit on the pages it opens (Decide, Compare, Notifications
            and the rest), so the bar always says where you are. */}
        <button
          type="button"
          className={`app-tab${drawerOpen || isMoreView(currentView) ? ' active' : ''}`}
          onClick={openDrawer}
          aria-label={unread > 0 ? `${APP_SHELL.more} (${unread} unread notifications)` : undefined}
          aria-expanded={drawerOpen}
          aria-controls="app-nav-drawer"
        >
          <IconMenu />
          <span className="app-tab-label">{APP_SHELL.more}</span>
          {unread > 0 && <span className="mobile-menu-unread" aria-hidden="true" />}
        </button>
      </nav>
    </div>
  );
}
