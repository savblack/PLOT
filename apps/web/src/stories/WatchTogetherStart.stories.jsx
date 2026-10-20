import { MemoryRouter } from 'react-router-dom';
import { expect, userEvent, waitFor, within } from 'storybook/test';
import { configure, getConfig } from '@plot/core/config.js';
import { WATCH_TOGETHER as T } from '@plot/core/copy/watchTogether.js';
import { AppContext } from '../hooks/useApp.js';
import WatchTogetherStart from '../components/WatchTogetherStart.jsx';
import { AcceptDialog, WatchTogetherTile } from '../components/WatchTogetherParts.jsx';

/* The Watch together start page for someone with nobody to watch with yet:
   a dark hero (friend search, invite link, example pairing), the people they
   follow when there are any, and the demo; Free adds one Premium card and
   Premium a dismissible welcome. People are fictional;
   a stub Supabase client answers search_users, so nothing here reads or
   writes account data. */

configure({
  supabaseUrl: import.meta.env.VITE_SUPABASE_URL,
  supabaseAnonKey: import.meta.env.VITE_SUPABASE_ANON_KEY,
  tmdbProxyUrl: import.meta.env.VITE_TMDB_PROXY_URL,
  isDev: true,
});

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
  rpc: async (name) => ({ data: name === 'search_users' ? people : name === 'watch_together_status' ? [{ state: 'none' }] : null, error: null }),
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
  watchlist: { items: [] },
});

export default {
  title: 'Watch together/Start',
  component: WatchTogetherStart,
  parameters: { layout: 'fullscreen' },
  decorators: [
    (Story, context) => {
      if (getConfig().supabaseClient !== stubClient) configure({ supabaseClient: stubClient });
      return (
        <MemoryRouter initialEntries={['/together']}>
          <AppContext.Provider value={app(context.args.premium)}>
            <div className="app-main-inner" style={{ padding: '1rem 0 3rem', minHeight: '100vh', background: 'var(--bg)' }}>
              <div className="wt-page wt-page--wide"><Story /></div>
            </div>
          </AppContext.Provider>
        </MemoryRouter>
      );
    },
  ],
  args: { premium: true, suggested: [], onInvite: async () => true },
};

const suggested = [
  { id: 'u-mia', display_name: 'Mia Alvarez', username: 'mia', avatar_url: null, overlap_count: 14 },
  { id: 'u-jordan', display_name: 'Jordan Lee', username: 'jordanl', avatar_url: null, overlap_count: 6 },
  { id: 'u-priya', display_name: 'Priya Nair', username: 'priya.n', avatar_url: null },
];

export const WithSuggestions = { args: { suggested } };
export const WithSuggestionsFree = { args: { suggested, premium: false } };
export const NobodySuggestedPremium = {};
export const NobodySuggestedFree = { args: { premium: false } };

export const SearchAndInvite = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.type(canvas.getByPlaceholderText(T.invite.search), 'sam');
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
