import { useState } from 'react';
import { FeedbackPanel } from '../components/SettingsView.jsx';
import AppSidebar from '../components/AppSidebar.jsx';

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
    (Story) => (
      <div
        className="sb-rail"
        style={{
          width: 260,
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

export const HelpClosed = { args: signedIn };
export const HelpOpen = { args: { ...signedIn, defaultHelpOpen: true } };

// Active rows have an accent label and a neutral selected surface.
export const ActiveCalendar = { args: { ...signedIn, currentView: 'calendar' } };
export const ActiveSettings = { args: { ...signedIn, currentView: 'settings' } };
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
export const FeedbackEntry = { args: signedIn, render: (args) => <FeedbackFlow {...args} /> };

export const Dark = { args: signedIn, decorators: [(Story) => <div data-theme="dark"><Story /></div>] };
