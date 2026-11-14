import { MemoryRouter } from 'react-router-dom';
import { expect, userEvent, waitFor, within } from 'storybook/test';
import { configure } from '@plot/core/config.js';
import { WATCH_TOGETHER as T } from '@plot/core/copy/watchTogether.js';
import { AppContext } from '../hooks/useApp.js';
import WatchTogetherView from '../components/WatchTogetherView.jsx';

/* The Watch together hub for someone with partners (Nov 14, round 3A): one
   card on the left (faces pick who's watching, one pink button, requests as a
   notice) and one shelf of what you share on the right. Free with everyone waiting on Premium puts the
   upgrade on each card. People and titles are fictional (negative ids, no
   posters); a stub Supabase client answers every call, so nothing here reads
   or writes account data. */

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
const title = (id, name, media_type, saved_by) => ({ tmdb_id: id, media_type, title: name, poster_path: null, release_date: '2024-01-01', genre_ids: [], provider_ids: [], saved_by });
const shared = [
  title(-101, 'East Pier', 'movie', ['u-mia', 'u-sam', 'u-priya']),
  title(-102, 'Digger Bay', 'movie', ['u-mia', 'u-sam']),
  title(-103, 'Slow Lane', 'tv', ['u-mia', 'u-sam', 'u-priya']),
  title(-104, 'Night Ferry', 'tv', ['u-mia', 'u-priya']),
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
  rpc: async (name, args) => {
    if (name === 'list_watch_together') return { data: rows, error: null };
    if (name === 'watch_together_titles') {
      const ids = args?.p_others || [];
      return { data: shared.filter(t => ids.every(id => t.saved_by.includes(id))), error: null };
    }
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
  watchlist: { items: [], isInList: () => false, add: noop, remove: noop },
  openPanel: noop,
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
    await waitFor(() => expect(canvas.getAllByRole('button', { name: T.hub.decideWith('Sam Okafor') })[0]).toBeEnabled());
    await waitFor(() => expect(canvas.getByRole('heading', { name: T.hub.savedWith('Sam Okafor') })).toBeInTheDocument());
    const faces = within(canvas.getByRole('group', { name: T.hub.whosWatching }));
    await userEvent.click(faces.getByRole('button', { name: T.hub.both }));
    await waitFor(() => expect(canvas.getByRole('heading', { name: T.hub.savedWith('Sam Okafor and Priya Nair') })).toBeInTheDocument());
  },
};

