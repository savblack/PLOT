import { MemoryRouter } from 'react-router-dom';
import { expect, userEvent, waitFor, within } from 'storybook/test';
import { configure } from '@plot/core/config.js';
import { WATCH_TOGETHER as T } from '@plot/core/copy/watchTogether.js';
import { AppContext } from '../hooks/useApp.js';
import WatchTogetherView from '../components/WatchTogetherView.jsx';

/* The Watch together hub for someone with partners. Free with everyone waiting
   on Premium shows the one Get Premium action; Premium shows who's watching
   chips and Decide. People are fictional; a stub Supabase client answers the
   list and suggestion calls, so nothing here reads or writes account data. */

configure({
  supabaseUrl: import.meta.env.VITE_SUPABASE_URL,
  supabaseAnonKey: import.meta.env.VITE_SUPABASE_ANON_KEY,
  tmdbProxyUrl: import.meta.env.VITE_TMDB_PROXY_URL,
  isDev: true,
});

const noop = () => {};
const partner = (id, name, username, overlap, can_decide) => ({ direction: 'paired', other_id: id, display_name: name, username, avatar_url: null, overlap_count: overlap, can_decide });
const incoming = { direction: 'incoming', other_id: 'u-jess', display_name: 'Jess Morgan', username: 'jessm', avatar_url: null };
const suggestions = [
  { id: 'u-alex', display_name: 'Alex Lin', username: 'alexl', avatar_url: null, overlap_count: 7 },
  { id: 'u-dana', display_name: 'Dana Reyes', username: 'danar', avatar_url: null, overlap_count: 4 },
  { id: 'u-tom', display_name: 'Tom Kask', username: 'tomk', avatar_url: null },
];
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
const clientFor = (rows) => ({
  rpc: async (name) => {
    if (name === 'list_watch_together') return { data: rows, error: null };
    if (name === 'suggest_watch_together') return { data: suggestions, error: null };
    if (name === 'my_watch_together_link') return { data: 'abc123', error: null };
    return { data: null, error: null };
  },
  from: () => queryOf([]),
  channel: () => ({ on() { return this; }, subscribe() { return this; } }),
  removeChannel: noop,
  auth: {
    getSession: async () => ({ data: { session: null }, error: null }),
    onAuthStateChange: () => ({ data: { subscription: { unsubscribe: noop } } }),
  },
});

const app = (is_premium) => ({
  user: { id: 'u-mia' },
  profile: { region: 'GB', is_premium, display_name: 'Mia', username: 'mia', is_public: true },
  watchlist: { items: [] },
});

export default {
  title: 'Watch together/Hub',
  component: WatchTogetherView,
  parameters: { layout: 'fullscreen' },
  decorators: [
    (Story, context) => {
      configure({ supabaseClient: clientFor(context.args.rows) });
      return (
        <MemoryRouter initialEntries={['/together']}>
          <AppContext.Provider value={app(context.args.premium)}>
            <div className="app-main-inner" style={{ padding: '1rem 0 3rem', minHeight: '100vh', background: 'var(--bg)' }}>
              <Story />
            </div>
          </AppContext.Provider>
        </MemoryRouter>
      );
    },
  ],
};

const waiting = [partner('u-sam', 'Sam Okafor', 'samo', 12, false), partner('u-priya', 'Priya Nair', 'priyan', 9, false), incoming];
const unlocked = [partner('u-sam', 'Sam Okafor', 'samo', 12, true), partner('u-priya', 'Priya Nair', 'priyan', 9, true), incoming];

export const FreePartnersWaiting = { args: { premium: false, rows: waiting } };
export const Premium = {
  args: { premium: true, rows: unlocked },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await waitFor(() => expect(canvas.getByRole('button', { name: T.hub.decideWith('Sam Okafor') })).toBeEnabled());
    await userEvent.click(canvas.getByRole('button', { name: /Priya/ }));
    await waitFor(() => expect(canvas.getByRole('button', { name: T.overlap.groupAction })).toBeEnabled());
  },
};

