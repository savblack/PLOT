import { APP_NAV_ITEMS } from '../navigation.js';
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

// Everything but Settings, which sits in the footer beside the profile row.
const SIDEBAR_NAV_ITEMS = APP_NAV_ITEMS.filter(item => item.id !== 'settings');
const SETTINGS_NAV_ITEM = APP_NAV_ITEMS.find(item => item.id === 'settings');

/**
 * @param {object}   props
 * @param {string}   props.currentView       Active view id, as AppShell computes it.
 * @param {object}   [props.profile]         Viewer's profile row; omit for signed-out.
 * @param {object}   [props.user]            Auth user; gates the notifications row.
 * @param {number}   [props.unread]          Unread notification count.
 * @param {Function} props.onNavigate        Called with a view id.
 * @param {Function} props.onNavigateProfile Called with a username.
 */
export default function AppSidebar({
  currentView,
  profile,
  user,
  unread = 0,
  onNavigate,
  onNavigateProfile,
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
        <span className="app-sidebar-brand-text">PLOT</span>
      </button>

      <nav className="app-sidebar-nav">
        {SIDEBAR_NAV_ITEMS.map(({ id, label }) => {
          const Icon = SIDEBAR_ICONS[id];
          return (
            <button
              key={id}
              type="button"
              className={`app-sidebar-item interactive-surface${currentView === id ? ' active' : ''}`}
              onClick={() => onNavigate(id)}
              aria-current={currentView === id ? 'page' : undefined}
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
      </nav>

      <div className="app-sidebar-foot">
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
        {profile?.username && (
          <button
            type="button"
            className={`app-sidebar-item interactive-surface${isOwnProfile ? ' active' : ''}`}
            onClick={() => onNavigateProfile(profile.username)}
            aria-current={isOwnProfile ? 'page' : undefined}
          >
            {profile.avatar_url
              ? <img className="app-sidebar-avatar" src={profile.avatar_url} alt="" />
              : <span className="app-sidebar-avatar app-sidebar-avatar-initial">{(profile.display_name || profile.username).charAt(0).toUpperCase()}</span>}
            <span className="app-sidebar-label">{profile.display_name || profile.username}</span>
          </button>
        )}
      </div>
    </aside>
  );
}
