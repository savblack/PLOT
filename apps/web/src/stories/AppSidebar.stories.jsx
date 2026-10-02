import { useLayoutEffect, useState } from 'react';
import { expect, userEvent, waitFor, within } from 'storybook/test';
import { themeAttributes } from '@plot/core/themes.js';
import { FeedbackPanel } from '../components/SettingsView.jsx';
import { MemoryRouter } from 'react-router-dom';
import AppSidebar from '../components/AppSidebar.jsx';
import { APP_NAV_ITEMS } from '../navigation.js';
import UpgradeSheet from '../components/UpgradeSheet.jsx';
import { AppContext } from '../hooks/useApp.js';
import { APP_SHELL } from '../copy/appShell.js';
import { SETTINGS_VIEW } from '../copy/settingsView.js';

/* The sidebar only appears above 1024px in the app, and its two most stateful
   rows (notifications, profile) only render for a signed-in viewer — which is
   exactly what a public route can't reach. These stories pin the rail open at
   its shipped width so every state can be looked at without a session. */

// .app-sidebar is display:none below the breakpoint and fixed above it; inside
// a story it becomes an ordinary block filling the frame. Everything else —
// row padding, gaps, icon size, accent — comes from app.css unchanged.
const RAIL_CSS = `
  .sb-rail .app-sidebar {
    display: flex;
    flex-direction: column;
    position: static;
    width: 100%;
    height: 100%;
    border-right: 0;
  }
`;

// Inline so the story renders the same offline as in CI.
const AVATAR = 'data:image/svg+xml;utf8,' + encodeURIComponent(
  '<svg xmlns="http://www.w3.org/2000/svg" width="48" height="48">' +
  '<rect width="48" height="48" fill="%23EBEBEC"/>' +
  '<circle cx="24" cy="19" r="8" fill="%23A1A1AA"/>' +
  '<path d="M8 48c0-9 7-16 16-16s16 7 16 16z" fill="%23A1A1AA"/></svg>'
);

export default {
  title: 'Components/AppSidebar',
  component: AppSidebar,
  parameters: { layout: 'centered' },
  decorators: [
    (Story, { args }) => (
      <div
        className={`sb-rail${args.collapsed ? ' sidebar-collapsed' : ''}`}
        style={{
          width: args.collapsed ? 80 : 260,
          height: 800,
          display: 'flex',
          background: 'var(--surface)',
          borderRight: '1px solid var(--border)',
        }}
      >
        <style>{RAIL_CSS}</style>
        <Story />
      </div>
    ),
  ],
  args: {
    currentView: 'home',
    onFeedback: () => {},
    onNavigate: () => {},
    onNavigateProfile: () => {},
  },
};

const profile = {
  username: 'savannah',
  display_name: 'Savannah',
  avatar_url: null,
};
const signedIn = { user: { id: 'u1' }, profile };

// What an anonymous viewer on a public profile route sees: no notifications
// row, no profile row. This is the only state reachable without signing in.
export const SignedOut = {};

export const SignedIn = { args: signedIn };

// The badge caps at 9+, so both sides of that threshold are worth a look.
export const UnreadBadge = { args: { ...signedIn, unread: 3 } };
export const UnreadBadgeCapped = { args: { ...signedIn, unread: 42 } };

// With no avatar image the row falls back to the display name's initial.
export const WithAvatar = {
  args: { ...signedIn, profile: { ...profile, avatar_url: AVATAR } },
};

// The rail without Settings, the Appearance row and the Help build Plot
// section: all three live in the account menu now (issue 1133), so the
// profile row is the whole foot.
export const RailClosed = { args: signedIn };
export const RailCollapsed = { args: { ...signedIn, collapsed: true } };

// Active rows have an accent label and a neutral selected surface.
export const ActiveCalendar = { args: { ...signedIn, currentView: 'calendar' } };
// Settings is no longer a rail item (it lives in the account menu), so on a
// Settings page the profile row carries the selected state instead.
export const ActiveSettings = {
  args: { ...signedIn, currentView: 'settings' },
  tags: ['interaction-test'],
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const nav = canvasElement.querySelector('.app-sidebar-nav');
    await expect(within(nav).queryByRole('button', { name: APP_NAV_ITEMS.find(item => item.id === 'settings').label })).toBeNull();
    const row = canvas.getByRole('button', { name: new RegExp(profile.display_name) });
    await expect(row).toHaveAttribute('aria-current', 'page');
    await expect(row).toHaveClass('active');
  },
};
export const ActiveSettingsSubpage = { args: { ...signedIn, currentView: 'settings/themes' } };
export const ActiveNotifications = {
  args: { ...signedIn, unread: 3, currentView: 'notifications' },
};

// The own-profile row highlights when the route matches the viewer's username.
export const ActiveOwnProfile = { args: { ...signedIn, currentView: 'u/savannah' } };

// A long display name must ellipsise rather than widen the rail.
export const LongDisplayName = {
  args: {
    ...signedIn,
    profile: { ...profile, display_name: 'Savannah Alexandra Blackwood-Fitzgerald' },
  },
};

export const ShortViewport = { parameters: {}, decorators: [(Story) => <div style={{ height: 480, overflow: 'hidden' }}><style>{`.sb-rail { height: 480px !important; }`}</style><Story /></div>], args: signedIn };


function FeedbackFlow(args) {
  const [open, setOpen] = useState(false);
  return <><AppSidebar {...args} onFeedback={() => setOpen(true)} />{open && <FeedbackPanel user={args.user} allTypes onClose={() => setOpen(false)} />}</>;
}

// Exercises the real composer without submitting data to the backend.
export const FeedbackEntry = { args: { ...signedIn, defaultAccountMenuOpen: true }, render: (args) => <FeedbackFlow {...args} /> };

export const Dark = { args: signedIn, decorators: [(Story) => <div data-theme="dark"><Story /></div>] };

// Premium destinations carry a pill for Free viewers only.
export const FreeViewerOnPickForMe = { args: { ...signedIn, currentView: 'tonight' } };
export const PremiumViewerOnPickForMe = {
  args: { ...signedIn, currentView: 'tonight', profile: { ...profile, is_premium: true } },
};

/* The account menu the profile row opens (issue 1133). Theme state is local to
   the story rather than useTheme, so a pick here never leaks into the next
   story through localStorage; it still paints the page the way the hook does. */
function AccountMenuDemo({ premium, initialMode = 'light', initialFamily = 'default', ...args }) {
  const [mode, setMode] = useState(initialMode);
  const [family, setFamily] = useState(initialFamily);
  const [locked, setLocked] = useState(null);
  const [feedbackOpen, setFeedbackOpen] = useState(false);

  useLayoutEffect(() => {
    const root = document.documentElement;
    const attrs = themeAttributes({ family, mode }, false);
    root.setAttribute('data-theme', attrs.mode);
    if (attrs.palette) root.setAttribute('data-palette', attrs.palette);
    else root.removeAttribute('data-palette');
    return () => {
      root.setAttribute('data-theme', 'light');
      root.removeAttribute('data-palette');
    };
  }, [family, mode]);

  const pickFamily = (next) => {
    if (next !== 'default' && !premium) return false;
    setFamily(next);
    return true;
  };

  return (
    <MemoryRouter>
      <AppContext.Provider value={{ profile: { id: 'story-user', is_premium: premium } }}>
        <AppSidebar
          {...args}
          profile={{ ...profile, is_premium: premium }}
          themeMode={mode}
          themeFamily={family}
          onPickMode={(m) => { setMode(m); return true; }}
          onPickFamily={pickFamily}
          onThemeLocked={setLocked}
          onFeedback={() => setFeedbackOpen(true)}
        />
        {locked && <UpgradeSheet reason="themes" family={locked} onClose={() => setLocked(null)} />}
        {feedbackOpen && <FeedbackPanel user={args.user} allTypes onClose={() => setFeedbackOpen(false)} />}
      </AppContext.Provider>
    </MemoryRouter>
  );
}

const renderMenu = (args) => <AccountMenuDemo {...args} />;
const open = { ...signedIn, defaultAccountMenuOpen: true };

export const AccountMenuPremium = { args: { ...open, premium: true }, render: renderMenu };
export const AccountMenuSageDark = {
  args: { ...open, premium: true, initialMode: 'dark', initialFamily: 'sage' },
  render: renderMenu,
};
export const AccountMenuFree = { args: { ...open, premium: false }, render: renderMenu };
export const AccountMenuCollapsedRail = {
  args: { ...open, premium: true, collapsed: true },
  render: renderMenu,
};

const profileRow = (canvas) => canvas.getByRole('button', { name: new RegExp(profile.display_name) });

// Enter opens the menu with focus on its first item; Escape closes it and
// hands focus back to the profile row.
export const AccountMenuKeyboard = {
  args: { ...signedIn, premium: true },
  render: renderMenu,
  tags: ['interaction-test'],
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const row = profileRow(canvas);
    await expect(row).toHaveAttribute('aria-haspopup', 'menu');
    await expect(row).toHaveAttribute('aria-expanded', 'false');

    row.focus();
    await userEvent.keyboard('{Enter}');
    const menu = await canvas.findByRole('menu', { name: APP_SHELL.accountMenu });
    await expect(row).toHaveAttribute('aria-expanded', 'true');
    await waitFor(() => expect(menu.contains(document.activeElement)).toBe(true));

    // Arrow keys walk the items; End lands on Sign out.
    await userEvent.keyboard('{End}');
    await expect(document.activeElement).toHaveTextContent(SETTINGS_VIEW.signOut);
    await userEvent.keyboard('{ArrowDown}');
    await expect(document.activeElement).toHaveAccessibleName(SETTINGS_VIEW.appearance.modes.light);

    // Help build Plot lives in the menu now, not the rail.
    await expect(within(menu).getByRole('menuitem', { name: APP_SHELL.giveFeedback })).toBeInTheDocument();
    await expect(within(menu).getByRole('menuitem', { name: new RegExp(SETTINGS_VIEW.support.supportPlot) })).toBeInTheDocument();

    await userEvent.keyboard('{Escape}');
    await expect(canvas.queryByRole('menu')).toBeNull();
    await expect(row).toHaveAttribute('aria-expanded', 'false');
    await expect(document.activeElement).toBe(row);
  },
};

// Clicking anywhere outside the menu closes it.
export const AccountMenuClickOutside = {
  args: { ...signedIn, premium: true },
  render: renderMenu,
  tags: ['interaction-test'],
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(profileRow(canvas));
    await canvas.findByRole('menu');
    await userEvent.click(canvasElement.ownerDocument.body);
    await expect(canvas.queryByRole('menu')).toBeNull();
  },
};

// A Premium pick applies at once and the menu stays open for another try.
export const AccountMenuThemePick = {
  args: { ...signedIn, premium: true },
  render: renderMenu,
  tags: ['interaction-test'],
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(profileRow(canvas));
    const menu = await canvas.findByRole('menu');
    const sage = within(menu).getByRole('menuitemradio', { name: SETTINGS_VIEW.appearance.families.sage });
    await userEvent.click(sage);
    await expect(sage).toHaveAttribute('aria-checked', 'true');
    await expect(document.documentElement.dataset.palette).toBe('sage');

    const dark = within(menu).getByRole('menuitemradio', { name: SETTINGS_VIEW.appearance.modes.dark });
    await userEvent.click(dark);
    await expect(dark).toHaveAttribute('aria-checked', 'true');
    await expect(document.documentElement.dataset.theme).toBe('dark');
    await expect(canvas.getByRole('menu')).toBeInTheDocument();
  },
};

// A Free viewer's Premium pick closes the menu and opens the upgrade sheet;
// the theme never applies.
export const AccountMenuFreeLocked = {
  args: { ...signedIn, premium: false },
  render: renderMenu,
  tags: ['interaction-test'],
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const body = within(canvasElement.ownerDocument.body);
    await userEvent.click(profileRow(canvas));
    const menu = await canvas.findByRole('menu');
    await userEvent.click(within(menu).getByRole('menuitemradio', { name: SETTINGS_VIEW.appearance.lockedTheme('Sage') }));
    await expect(await body.findByRole('dialog')).toHaveTextContent(SETTINGS_VIEW.appearance.previewing('Sage'));
    await expect(canvas.queryByRole('menu')).toBeNull();
    await expect(document.documentElement.dataset.palette).toBeUndefined();
  },
};
