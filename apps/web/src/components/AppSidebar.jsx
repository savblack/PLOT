// Desktop web layout: the fixed rail and scroll regions use DOM/CSS. Mobile parity: https://github.com/savblack/PLOT/issues/920.
import { useState } from 'react';
import { APP_NAV_ITEMS, isActiveView } from '../navigation.js';
import PlotLogo from './PlotLogo.jsx';
import { SETTINGS_VIEW } from '../copy/settingsView.js';
import { APP_SHELL } from '../copy/appShell.js';
import { IconHome, IconGuide, IconCalendar, IconLists, IconHistory, IconSearch, IconBell, IconSettings } from './navIcons.jsx';

/* The desktop nav rail. Replaces the bottom tab bar and the nav drawer above
   1024px — the two of them listed the same destinations bar Settings.

   Deliberately presentational: every piece of state arrives as a prop, so the
   signed-in rows (notifications with an unread badge, the profile row) can be
   rendered in Storybook without an auth session. AppShell owns the routing and
   the notification count. */

// Keyed by the same ids as APP_NAV_ITEMS so the rail builds off the shared nav
// list rather than a second hardcoded one that can drift from mobile.
const SIDEBAR_ICONS = {
  home: IconHome,
  guide: IconGuide,
  calendar: IconCalendar,
  'my-lists': IconLists,
  history: IconHistory,
  search: IconSearch,
  settings: IconSettings,
};

// Search leads the desktop list; Settings follows Notifications.
const SIDEBAR_NAV_ITEMS = [
  APP_NAV_ITEMS.find(item => item.id === 'search'),
  ...APP_NAV_ITEMS.filter(item => item.id !== 'settings' && item.id !== 'search'),
];
const SETTINGS_NAV_ITEM = APP_NAV_ITEMS.find(item => item.id === 'settings');

/**
 * @param {object}   props
 * @param {string}   props.currentView       Active view id, as AppShell computes it.
 * @param {object}   [props.profile]         Viewer's profile row; omit for signed-out.
 * @param {object}   [props.user]            Auth user; gates the notifications row.
 * @param {number}   [props.unread]          Unread notification count.
 * @param {boolean}  [props.collapsed]       Whether the desktop rail is icon-only.
 * @param {Function} props.onToggleCollapsed Toggles the desktop rail width.
 * @param {Function} props.onNavigate        Called with a view id.
 * @param {Function} props.onFeedback        Opens the existing feedback composer.
 * @param {Function} props.onNavigateProfile Called with a username.
 * @param {boolean}  [props.defaultHelpOpen] Seeds the help disclosure. Only so
 *   Storybook can render the open state; the app leaves it closed and lets the
 *   viewer decide.
 */
export default function AppSidebar({
  currentView,
  profile,
  user,
  unread = 0,
  collapsed = false,
  onToggleCollapsed,
  onNavigate,
  onNavigateProfile,
  onFeedback,
  defaultHelpOpen = false,
}) {
  const isOwnProfile = !!profile?.username && currentView === `u/${profile.username}`;
  const [helpOpen, setHelpOpen] = useState(defaultHelpOpen);

  return (
    <aside className="app-sidebar">
      <button
        type="button"
        className="app-sidebar-collapse-rail"
        onClick={onToggleCollapsed}
        aria-label={collapsed ? APP_SHELL.expandNavigation : APP_SHELL.collapseNavigation}
      >
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <polyline points={collapsed ? '9 18 15 12 9 6' : '15 18 9 12 15 6'} />
        </svg>
      </button>
      <button
        type="button"
        className="app-sidebar-brand interactive-surface"
        onClick={() => onNavigate('home')}
        aria-label={APP_SHELL.goToHome}
      >
        <PlotLogo
          className="app-sidebar-brand-text"
          style={{ fontSize: collapsed ? '1.35rem' : '2.35rem' }}
        />
        {!collapsed && <span className="app-sidebar-beta">{APP_SHELL.beta}</span>}
      </button>

      <div className="app-sidebar-scroll">
        <nav className="app-sidebar-nav">
          {SIDEBAR_NAV_ITEMS.map(({ id, label }) => {
            const Icon = SIDEBAR_ICONS[id];
            return (
              <button
                key={id}
                type="button"
                className={`app-sidebar-item interactive-surface${isActiveView(currentView, id) ? ' active' : ''}`}
                onClick={() => onNavigate(id)}
                aria-current={isActiveView(currentView, id) ? 'page' : undefined}
              >
                {Icon && <Icon />}
                <span className="app-sidebar-label">{label}</span>
              </button>
            );
          })}

          {user && (
            <button
              type="button"
              className={`app-sidebar-item interactive-surface${currentView === 'notifications' ? ' active' : ''}`}
              onClick={() => onNavigate('notifications')}
              aria-label={`${APP_SHELL.notifications}${unread ? ` (${unread} unread)` : ''}`}
              aria-current={currentView === 'notifications' ? 'page' : undefined}
            >
              <IconBell />
              <span className="app-sidebar-label">{APP_SHELL.notifications}</span>
              {unread > 0 && (
                <span className="app-sidebar-badge" aria-hidden="true">{unread > 9 ? '9+' : unread}</span>
              )}
            </button>
          )}

          {SETTINGS_NAV_ITEM && (
            <button
              type="button"
              className={`app-sidebar-item interactive-surface${currentView === 'settings' ? ' active' : ''}`}
              onClick={() => onNavigate('settings')}
              aria-current={currentView === 'settings' ? 'page' : undefined}
            >
              <IconSettings />
              <span className="app-sidebar-label">{SETTINGS_NAV_ITEM.label}</span>
            </button>
          )}
        </nav>
      </div>
      <div className="app-sidebar-foot">
        <button
          type="button"
          className="app-sidebar-item app-sidebar-help-toggle interactive-surface"
          onClick={() => setHelpOpen(open => !open)}
          aria-expanded={helpOpen}
          aria-controls="app-sidebar-help"
        >
          <svg viewBox="0 0 24 24" aria-hidden="true" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="10,6 16,12 10,18" />
          </svg>
          <span className="app-sidebar-label">{APP_SHELL.helpBuild}</span>
        </button>
        {helpOpen && (
          <div id="app-sidebar-help" className="app-sidebar-help" aria-label={APP_SHELL.helpBuild}>
            <button type="button" className="app-sidebar-item interactive-surface" onClick={onFeedback}>
              <svg viewBox="0 0 24 24" aria-hidden="true" strokeLinecap="round" strokeLinejoin="round">
                <path d="M21 14a3 3 0 0 1-3 3H8l-5 4V6a3 3 0 0 1 3-3h12a3 3 0 0 1 3 3Z" />
                <path d="M12 7.5v6M9 10.5h6" />
              </svg>
              <span className="app-sidebar-label">{APP_SHELL.giveFeedback}</span>
            </button>
            <a
              className="app-sidebar-item interactive-surface"
              href="https://ko-fi.com/J7P123TYGK"
              target="_blank"
              rel="noopener noreferrer"
              aria-label={`${SETTINGS_VIEW.support.supportPlot} (${APP_SHELL.opensNewTab})`}
            >
              <svg viewBox="0 0 24 24" aria-hidden="true" strokeLinecap="round" strokeLinejoin="round">
                <path d="M20.8 5.6a5.4 5.4 0 0 0-7.7 0L12 6.7l-1.1-1.1a5.4 5.4 0 1 0-7.7 7.7l8.8 8.7 8.8-8.7a5.4 5.4 0 0 0 0-7.7Z" />
              </svg>
              <span className="app-sidebar-label">{SETTINGS_VIEW.support.supportPlot}</span>
            </a>
          </div>
        )}
        {profile?.username && (
          <div className="app-sidebar-foot-profile">
            <button
              type="button"
              className={`app-sidebar-item app-sidebar-profile interactive-surface${isOwnProfile ? ' active' : ''}`}
              onClick={() => onNavigateProfile(profile.username)}
              aria-current={isOwnProfile ? 'page' : undefined}
            >
              {profile.avatar_url
                ? <img className="app-sidebar-avatar" src={profile.avatar_url} alt="" />
                : <span className="app-sidebar-avatar app-sidebar-avatar-initial">{(profile.display_name || profile.username).charAt(0).toUpperCase()}</span>}
              <span className="app-sidebar-profile-copy"><span className="app-sidebar-label">{profile.display_name || profile.username}</span><small>{APP_SHELL.viewYourProfile}</small></span>
            </button>
          </div>
        )}
      </div>
    </aside>
  );
}
