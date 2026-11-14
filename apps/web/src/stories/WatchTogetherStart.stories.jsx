import { MemoryRouter } from 'react-router-dom';
import { expect, userEvent, waitFor, within } from 'storybook/test';
import { configure, getConfig } from '@plot/core/config.js';
import { WATCH_TOGETHER as T } from '@plot/core/copy/watchTogether.js';
import { AppContext } from '../hooks/useApp.js';
import { INVITE_SHARED_KEY } from '@plot/core/watchTogether.js';
import WatchTogetherView from '../components/WatchTogetherView.jsx';
import { AcceptDialog, WatchTogetherTile } from '../components/WatchTogetherParts.jsx';

/* Watch together for someone with nobody to watch with yet, the normal state
   (Nov 2026 redesign). The invite card leads with the link, because most people
   invite someone who isn't on Plot; then the demo and, second, search for people
   already on Plot. "Waiting" is the same page after the link has gone out.
   People are fictional; a stub Supabase client answers the calls, so nothing
   here reads or writes account data. */

configure({
  supabaseUrl: import.meta.env.VITE_SUPABASE_URL,
  supabaseAnonKey: import.meta.env.VITE_SUPABASE_ANON_KEY,
  tmdbProxyUrl: import.meta.env.VITE_TMDB_PROXY_URL,
  isDev: true,
});

// suggest_watch_together's answer for the story being shown.
let currentSuggested = [];
const people = [
  { id: 'u-sam', display_name: 'Sam Kerr', username: 'samk', avatar_url: null },
  { id: 'u-samira', display_name: 'Samira', username: 'samira.b', avatar_url: null },
];
const noop = () => {};
const queryOf = (data) => {
  const result = { data, error: null };
  const chain = new Proxy(function query() {}, {
    get(_target, prop) {
      if (prop === 'then') return (ok, fail) => Promise.resolve(result).then(ok, fail);
      return () => chain;
    },
  });
  return chain;
};
const stubClient = {
  rpc: async (name) => {
    if (name === 'search_users') return { data: people, error: null };
    if (name === 'watch_together_status') return { data: [{ state: 'none' }], error: null };
    if (name === 'list_watch_together') return { data: [], error: null };
    if (name === 'suggest_watch_together') return { data: currentSuggested, error: null };
    if (name === 'my_watch_together_link') return { data: 'abc123', error: null };
    return { data: null, error: null };
  },
  // Mia and Sam follow each other, so the accept sheet shares by default.
  from: (table) => queryOf(table === 'follows' ? [{ follower_id: 'u-mia' }, { follower_id: 'u-sam' }] : []),
  channel: () => ({ on() { return this; }, subscribe() { return this; } }),
  removeChannel: noop,
  auth: {
    getSession: async () => ({ data: { session: null }, error: null }),
    onAuthStateChange: () => ({ data: { subscription: { unsubscribe: noop } } }),
  },
};

const app = (is_premium) => ({
  user: { id: 'u-mia' },
  profile: { region: 'GB', is_premium, display_name: 'Mia', username: 'mia', is_public: true },
  watchlist: { items: [], isInList: () => false, add: noop, remove: noop },
  openPanel: noop,
});

export default {
  title: 'Watch together/Start',
  component: WatchTogetherView,
  parameters: { layout: 'fullscreen' },
  decorators: [
    (Story, context) => {
      if (getConfig().supabaseClient !== stubClient) configure({ supabaseClient: stubClient });
      currentSuggested = context.args.suggested || [];
      try {
        if (context.args.sharedAt) window.localStorage.setItem(INVITE_SHARED_KEY, context.args.sharedAt);
        else window.localStorage.removeItem(INVITE_SHARED_KEY);
      } catch { /* storage blocked */ }
      return (
        <MemoryRouter initialEntries={['/together']}>
          <AppContext.Provider value={app(context.args.premium)}>
            <div className="app-main-inner" style={{ padding: '1rem 0 3rem', minHeight: '100vh', background: 'var(--bg)' }}>
              <Story key={`${context.args.sharedAt || ''}:${(context.args.suggested || []).length}`} />
            </div>
          </AppContext.Provider>
        </MemoryRouter>
      );
    },
  ],
  args: { premium: false, suggested: [] },
};

const suggested = [
  { id: 'u-mia', display_name: 'Mia Alvarez', username: 'mia', avatar_url: null, overlap_count: 14 },
  { id: 'u-jordan', display_name: 'Jordan Lee', username: 'jordanl', avatar_url: null, overlap_count: 6 },
  { id: 'u-priya', display_name: 'Priya Nair', username: 'priya.n', avatar_url: null },
];

export const NobodyYet = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await waitFor(() => expect(canvas.getByRole('heading', { name: T.hub.inviteTitle })).toBeInTheDocument());
    await expect(canvas.getByRole('button', { name: T.hub.sendInvite })).toBeEnabled();
  },
};
export const NobodyYetPremium = { args: { premium: true } };
export const WaitingForSomeone = {
  args: { sharedAt: '2026-11-11T12:00:00' },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await waitFor(() => expect(canvas.getByRole('heading', { name: T.hub.waitingTitle })).toBeInTheDocument());
    await expect(canvas.getByText(T.hub.sharedOn('November 11'))).toBeInTheDocument();
  },
};
export const WithPeopleYouFollow = { args: { suggested } };

export const SearchAndInvite = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.type(await canvas.findByPlaceholderText(T.invite.search), 'sam');
    await waitFor(() => expect(canvas.getByText('@samk')).toBeInTheDocument());
    await userEvent.click(canvas.getAllByRole('button', { name: T.invite.invite })[0]);
    await waitFor(() => expect(canvas.getByText(T.invite.sent)).toBeInTheDocument());
  },
};

/* Accepting when you follow each other: "Also share my full watchlist" starts on. */
export const AcceptMutualFollow = {
  render: () => <AcceptDialog person={{ id: 'u-sam', display_name: 'Sam', username: 'samk' }} viewer={{ id: 'u-mia', is_public: false }} onAccept={noop} onDecline={noop} onClose={noop} />,
  play: async () => {
    const dialog = within(document.body);
    await waitFor(() => expect(dialog.getByRole('switch', { name: T.accept.shareFull })).toBeChecked());
  },
};

/* A friend's profile when you follow each other: the tile says what the invite shares. */
export const ProfileTileMutualFollow = {
  render: () => <WatchTogetherTile person={{ id: 'u-sam', username: 'samk', display_name: 'Sam', is_public: false }} viewer={{ id: 'u-mia' }} viewerProfile={{ is_premium: true }} />,
};
