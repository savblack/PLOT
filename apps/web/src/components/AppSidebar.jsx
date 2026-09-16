// Desktop web layout: the fixed rail and scroll regions use DOM/CSS. Mobile parity: https://github.com/savblack/PLOT/issues/920.
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
 * @param {Function} props.onNavigate        Called with a view id.
 * @param {Function} props.onFeedback        Opens the existing feedback composer.
 * @param {Function} props.onNavigateProfile Called with a username.
 */
export default function AppSidebar({
  currentView,
  profile,
  user,
  unread = 0,
  onNavigate,
  onNavigateProfile,
  onFeedback,
}) {
  const isOwnProfile = !!profile?.username && currentView === `u/${profile.username}`;

  return (
    <aside className="app-sidebar">
      <button
        type="button"
        className="app-sidebar-brand interactive-surface"
        onClick={() => onNavigate('home')}
        aria-label={APP_SHELL.goToHome}
      >
        <PlotLogo className="app-sidebar-brand-text" style={{ fontSize: '2.35rem' }} />
        <span className="app-sidebar-beta">{APP_SHELL.beta}</span>
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
        <section className="app-sidebar-help" aria-label={APP_SHELL.helpBuild}>
          <div className="app-sidebar-help-intro">
            <h2>{APP_SHELL.helpBuild}</h2>
            <p>{APP_SHELL.helpBuildHint}</p>
          </div>
          <button type="button" className="app-sidebar-action" onClick={onFeedback}>
            <svg viewBox="0 0 24 24" aria-hidden="true">
              <path d="M21 14a3 3 0 0 1-3 3H8l-5 4V6a3 3 0 0 1 3-3h12a3 3 0 0 1 3 3Z" />
              <path d="M8 8h8M8 12h5" />
            </svg>
            <span><strong>{APP_SHELL.giveFeedback}</strong><small>{APP_SHELL.feedbackHint}</small></span>
            <span className="app-sidebar-action-arrow" aria-hidden="true">→</span>
          </button>
          <a className="app-sidebar-action" href="https://ko-fi.com/J7P123TYGK" target="_blank" rel="noopener noreferrer">
            <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M20 5c-3-3-6-1-8 1-2-2-5-4-8-1-4 4 1 9 8 15 7-6 12-11 8-15Z" /></svg>
            <span><strong>{SETTINGS_VIEW.support.supportPlot}</strong><small>{APP_SHELL.supportHint}</small></span>
            <span className="app-sidebar-action-arrow" aria-hidden="true">↗</span>
          </a>
        </section>
      </div>
      <div className="app-sidebar-foot">
        {profile?.username && (
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
            <span className="app-sidebar-profile-arrow" aria-hidden="true">›</span>
          </button>
        )}
      </div>
    </aside>
  );
}
