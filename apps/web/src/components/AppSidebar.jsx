// Desktop web layout: the fixed rail and scroll regions use DOM/CSS. Mobile parity: https://github.com/savblack/PLOT/issues/920.
import { APP_NAV_ITEMS, isActiveView, sidebarNavItems } from '../navigation.js';
import PlotLogo from './PlotLogo.jsx';
import AccountMenu from './AccountMenu.jsx';
import { isPremiumProfile } from '@plot/core/premium.js';
import { APP_SHELL } from '../copy/appShell.js';
import { IconBell, NAV_ICONS } from './navIcons.jsx';

/* The desktop nav rail. Replaces the bottom tab bar and the nav drawer above
   1024px — the two of them listed the same destinations bar Settings.

   Deliberately presentational: every piece of state arrives as a prop, so the
   signed-in rows (notifications with an unread badge, the profile row) can be
   rendered in Storybook without an auth session. AppShell owns the routing and
   the notification count. */

// Search leads the desktop list. Settings is not in the rail: it lives in the
// account menu the profile row opens (issue 1133). The list itself is shared
// with mobile in @plot/core/navigation.js, so it is filtered in ../navigation.js
// rather than removed there; the phone drawer below 1024px keeps its own
// Settings row. The viewer may reorder the middle (Settings > Appearance).
const SETTINGS_NAV_ITEM = APP_NAV_ITEMS.find(item => item.id === 'settings');

/**
 * @param {object}   props
 * @param {string}   props.currentView       Active view id, as AppShell computes it.
 * @param {object}   [props.profile]         Viewer's profile row; omit for signed-out.
 * @param {object}   [props.user]            Auth user; gates the notifications row.
 * @param {number}   [props.unread]          Unread notification count.
 * @param {boolean}  [props.collapsed]       Whether the desktop rail is icon-only.
 * @param {string[]} [props.sidebarOrder]   Saved ui_prefs.sidebar: nav ids in the viewer's order.
 * @param {Function} props.onToggleCollapsed Toggles the desktop rail width.
 * @param {Function} props.onNavigate        Called with a view id.
 * @param {Function} props.onFeedback        Opens the existing feedback composer.
 * @param {Function} props.onNavigateProfile Called with a username.
 * @param {Function} [props.onSignOut]       Starts the existing /logout flow.
 * @param {string}   [props.themeMode]       useTheme().mode (light | dark | system).
 * @param {string}   [props.themeFamily]     useTheme().family showing.
 * @param {Function} [props.onPickMode]      useTheme().setMode.
 * @param {Function} [props.onPickFamily]    useTheme().setFamily; false for a locked family.
 * @param {Function} [props.onThemeLocked]   Called with a Premium family a Free viewer tapped.
 * @param {boolean}  [props.defaultAccountMenuOpen] Seeds the account menu open.
 *   Only so Storybook can render the open state.
 */
export default function AppSidebar({
  currentView,
  profile,
  user,
  unread = 0,
  collapsed = false,
  sidebarOrder,
  onToggleCollapsed,
  onNavigate,
  onNavigateProfile,
  onFeedback,
  onSignOut,
  themeMode,
  themeFamily,
  onPickMode,
  onPickFamily,
  onThemeLocked,
  defaultAccountMenuOpen = false,
}) {
  const isOwnProfile = !!profile?.username && currentView === `u/${profile.username}`;
  // With Settings gone from the rail, the profile row stands in for it so a
  // Settings page (and /settings/*) still shows where the viewer is.
  const isSettingsView = isActiveView(currentView, 'settings');
  // Free viewers see which destinations are Premium before they tap in.
  const showPremiumPill = !isPremiumProfile(profile);

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
          {sidebarNavItems(sidebarOrder).map(({ id, label, premium }) => {
            const Icon = NAV_ICONS[id];
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
                {premium && showPremiumPill && !collapsed && <span className="app-nav-premium">{APP_SHELL.premium}</span>}
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
      </div>
      <div className="app-sidebar-foot">
        {/* The profile row opens the account menu: theme, account links,
            Help build Plot and Sign out all live there (issue 1133). */}
        {profile?.username && (
          <AccountMenu
            profile={profile}
            active={isOwnProfile || isSettingsView}
            current={isOwnProfile || isSettingsView}
            settingsLabel={SETTINGS_NAV_ITEM?.label}
            onViewProfile={() => onNavigateProfile(profile.username)}
            onSettings={() => onNavigate('settings')}
            onFeedback={onFeedback}
            onSignOut={onSignOut}
            mode={themeMode}
            family={themeFamily}
            onPickMode={onPickMode}
            onPickFamily={onPickFamily}
            isPremium={isPremiumProfile(profile)}
            onLocked={onThemeLocked}
            defaultOpen={defaultAccountMenuOpen}
          />
        )}
      </div>
    </aside>
  );
}
