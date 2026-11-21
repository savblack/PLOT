import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { expect, userEvent, waitFor, within } from 'storybook/test';
import { configure } from '@plot/core/config.js';
import { WATCH_TOGETHER as T } from '@plot/core/copy/watchTogether.js';
import { TONIGHT_PICKER as TP } from '@plot/core/copy/tonightPicker.js';
import { AppContext } from '../hooks/useApp.js';
import WatchTogetherView from '../components/WatchTogetherView.jsx';

/* Watch together's mood step (Nov 21): before the cards, Movies or TV, moods
   and My services, with how many shared titles each chip keeps. People and
   titles are fictional (negative ids, no posters). Genre and provider ids are
   TMDB's fixed catalog ids (Comedy 35, Drama 18, Crime 80, Horror 27,
   Thriller 53, Romance 10749). A stub Supabase client answers every call. */

configure({
  supabaseUrl: import.meta.env.VITE_SUPABASE_URL,
  supabaseAnonKey: import.meta.env.VITE_SUPABASE_ANON_KEY,
  tmdbProxyUrl: import.meta.env.VITE_TMDB_PROXY_URL,
  isDev: true,
});

const noop = () => {};
const MY_SERVICE = 8;
const sam = { direction: 'paired', other_id: 'u-sam', display_name: 'Sam Okafor', username: 'samo', avatar_url: null, overlap_count: 9, can_decide: true };
const title = (id, name, media_type, genre_ids, provider_ids = []) => ({ tmdb_id: id, media_type, title: name, poster_path: null, release_date: '2024-01-01', genre_ids, provider_ids, saved_by: ['u-mia', 'u-sam'] });
const shared = [
  title(-201, 'East Pier', 'movie', [35], [MY_SERVICE]),
  title(-202, 'Digger Bay', 'movie', [35, 10749]),
  title(-203, 'Low Tide', 'movie', [27, 53], [MY_SERVICE]),
  title(-204, 'Small Hours', 'movie', [18]),
  title(-205, 'Paper Moons', 'movie', [10749], [MY_SERVICE]),
  title(-206, 'The Lodgers', 'tv', [35], [MY_SERVICE]),
  title(-207, 'Hollow Creek', 'tv', [80]),
  title(-208, 'Second Act', 'tv', [18, 35]),
  title(-209, 'Glass House', 'tv', [80, 18], [MY_SERVICE]),
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
const client = {
  rpc: async (name) => {
    if (name === 'list_watch_together') return { data: [sam], error: null };
    if (name === 'watch_together_titles') return { data: shared, error: null };
    return { data: null, error: null };
  },
  from: () => queryOf([]),
  channel: () => ({ on() { return this; }, subscribe() { return this; } }),
  removeChannel: noop,
  auth: {
    getSession: async () => ({ data: { session: null }, error: null }),
    onAuthStateChange: () => ({ data: { subscription: { unsubscribe: noop } } }),
  },
};

const app = {
  user: { id: 'u-mia' },
  profile: { region: 'US', is_premium: true, display_name: 'Mia', username: 'mia', is_public: true, streaming_providers: [{ id: MY_SERVICE, name: 'Example service' }] },
  watchlist: { items: [], isInList: () => false, add: noop, remove: noop },
  openPanel: noop,
};

export default {
  title: 'Watch together/Mood step',
  component: WatchTogetherView,
  parameters: { layout: 'fullscreen' },
  decorators: [
    (Story) => {
      configure({ supabaseClient: client });
      return (
        <MemoryRouter initialEntries={['/together/decide/samo']}>
          <AppContext.Provider value={app}>
            <div className="app-main-inner" style={{ padding: '1rem 0 3rem', minHeight: '100vh', background: 'var(--bg)' }}>
              <Routes><Route path="/together/decide/:username" element={<Story />} /></Routes>
            </div>
          </AppContext.Provider>
        </MemoryRouter>
      );
    },
  ],
  render: () => <WatchTogetherView page="mood" />,
};

export const Default = {
  tags: ['interaction-test'],
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const start = await canvas.findByRole('button', { name: T.mood.start(9) });
    await expect(start).toBeEnabled();
    // Funny keeps the four comedies; picking it narrows the deck.
    await userEvent.click(canvas.getByRole('button', { name: `${TP.chips.moods.funny} 4` }));
    await waitFor(() => expect(canvas.getByRole('button', { name: T.mood.start(4) })).toBeEnabled());
    // Shows only: Romantic and Scary aren't offered (no stored genre for them).
    await userEvent.click(canvas.getByRole('tab', { name: TP.chips.shows }));
    await expect(canvas.queryByRole('button', { name: new RegExp(`^${TP.chips.moods.scary}`) })).toBeNull();
    // Nothing to keep: Animated is greyed out.
    await expect(canvas.getByRole('button', { name: `${TP.chips.moods.animated} 0` })).toBeDisabled();
  },
};

export const NothingFits = {
  tags: ['interaction-test'],
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(await canvas.findByRole('button', { name: `${TP.chips.moods.moving} 3` }));
    await userEvent.click(canvas.getByRole('tab', { name: TP.chips.movies }));
    await userEvent.click(canvas.getByRole('button', { name: TP.summary.services }));
    await waitFor(() => expect(canvas.getByRole('heading', { name: T.mood.noneTitle })).toBeInTheDocument());
    await expect(canvas.getByRole('button', { name: T.mood.start(0) })).toBeDisabled();
    await userEvent.click(canvas.getByRole('button', { name: new RegExp(T.mood.fixes.services) }));
    await waitFor(() => expect(canvas.getByRole('button', { name: T.mood.start(1) })).toBeEnabled());
  },
};
