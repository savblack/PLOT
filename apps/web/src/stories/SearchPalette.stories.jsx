import { MemoryRouter } from 'react-router-dom';
import { configure } from '@plot/core/config.js';
import { expect, fn, userEvent, within } from 'storybook/test';
import { AppContext } from '../hooks/useApp.js';
import SearchPalette from '../components/SearchPalette.jsx';

/* The real palette against live TMDB via the proxy in .env. `user` is null so
   the friends RPC is never called and useHistory never touches Supabase. The
   empty library also keeps the automated interaction free of guessed IDs. */

configure({
  supabaseUrl: import.meta.env.VITE_SUPABASE_URL,
  supabaseAnonKey: import.meta.env.VITE_SUPABASE_ANON_KEY,
  // Browser tests do not load local secrets. The data URL gives useGenres a
  // deterministic empty response while the interactive Storybook still uses
  // the real proxy whenever it is configured.
  tmdbProxyUrl: import.meta.env.VITE_TMDB_PROXY_URL || 'data:application/json,%7B%22genres%22%3A%5B%5D%7D#',
  isDev: true,
});

const app = {
  user: null,
  profile: null,
  watching: { items: [] },
  openPanel: fn(),
  watchlist: { items: [], isInList: () => false, toggle: fn() },
};

export default {
  title: 'Search/SearchPalette',
  component: SearchPalette,
  tags: ['interaction-test'],
  parameters: { layout: 'fullscreen', a11y: { test: 'error' } },
  decorators: [
    (Story) => (
      <MemoryRouter>
        <AppContext.Provider value={app}>
          <div style={{ minHeight: '100vh', background: 'var(--bg)' }}>
            <Story />
          </div>
        </AppContext.Provider>
      </MemoryRouter>
    ),
  ],
};

export const Open = {
  // The search and genre responses are live when the proxy is configured.
  parameters: { chromatic: { disableSnapshot: true } },
  args: { onClose: fn() },
  render: args => <SearchPalette {...args} />,
  play: async ({ args, canvasElement }) => {
    const body = within(canvasElement.ownerDocument.body);
    const dialog = body.getByRole('dialog', { name: 'Search Plot' });
    const input = within(dialog).getByRole('combobox');

    await expect(input).toHaveFocus();
    await userEvent.type(input, 'S');
    await expect(input).toHaveValue('S');
    await userEvent.click(within(dialog).getByRole('button', { name: 'Clear search' }));
    await expect(input).toHaveValue('');
    await userEvent.keyboard('{Escape}');
    await expect(args.onClose).toHaveBeenCalledOnce();
  },
};

/* "Search in: My Lists". Local only, so nothing is fetched: the rows come
   from the lists below. `user` has no id, so useHistory stays idle.
   Symbolic identifiers are local fixtures, never TMDB lookup IDs. */
const signedInApp = {
  ...app,
  user: { email: 'story@example.com' },
  watching: { items: [{ tmdb_id: 'fixture-show', title: 'Quiet Days', poster_path: null }], loading: false },
  watchlist: {
    items: [{ tmdb_id: 'fixture-film', media_type: 'movie', title: 'The Quiet Night', poster_path: null }],
    loading: false,
    isInList: () => false,
    toggle: fn(),
  },
  reminders: { reminders: [], loading: false },
  topLists: { lists: { movies: [], tv: [] } },
  favorites: { favorites: [] },
  customLists: { lists: [{ id: 'fixture-list', name: 'Rainy Sunday', items: [{ tmdb_id: 'fixture-film-2', media_type: 'movie', title: 'A Loud Morning', poster_path: null }] }] },
};

export const SearchInMyLists = {
  args: { onClose: fn() },
  render: args => (
    <AppContext.Provider value={signedInApp}>
      <SearchPalette {...args} />
    </AppContext.Provider>
  ),
  play: async ({ canvasElement }) => {
    const body = within(canvasElement.ownerDocument.body);
    const dialog = within(body.getByRole('dialog', { name: 'Search Plot' }));
    const input = dialog.getByRole('combobox');

    // No smart lists on this account, so that place is not offered.
    await expect(dialog.queryByRole('radio', { name: 'Smart lists' })).toBeNull();
    await userEvent.click(dialog.getByRole('radio', { name: 'My Lists' }));
    await expect(dialog.getByRole('radio', { name: 'My Lists' })).toBeChecked();
    // Picking a place hands focus back to the box.
    await expect(input).toHaveFocus();

    await userEvent.type(input, 'quiet');
    const options = await dialog.findAllByRole('option');
    await expect(options).toHaveLength(2);
    await expect(options[0]).toHaveTextContent('Quiet Days');
    await expect(options[1]).toHaveTextContent('The Quiet Night');

    await userEvent.clear(input);
    await userEvent.type(input, 'loud');
    await expect(await dialog.findByRole('option')).toHaveTextContent('Rainy Sunday');

    await userEvent.clear(input);
    await userEvent.type(input, 'zzzz');
    await expect(await dialog.findByText(/Nothing in My Lists matches/)).toBeInTheDocument();
  },
};

/* "Search in: Smart lists". Premium, with one smart list whose rule is "movies
   from my watchlist", which is answered from the watchlist above without
   asking TMDB. */
const smartApp = {
  ...signedInApp,
  profile: { is_premium: true },
  // Smart list rules read numeric ids. 900001 is a local fixture (the same one
  // the core smart list tests use), never looked up on TMDB.
  watchlist: {
    ...signedInApp.watchlist,
    items: [{ tmdb_id: 900001, media_type: 'movie', title: 'The Quiet Night', poster_path: null }],
  },
  customLists: {
    ...signedInApp.customLists,
    smartLists: [{ id: 'fixture-smart', name: 'Saved films', rules: { v: 1, source: 'watchlist', mediaType: 'movie' } }],
  },
};

export const SearchInSmartLists = {
  args: { onClose: fn() },
  render: args => (
    <AppContext.Provider value={smartApp}>
      <SearchPalette {...args} />
    </AppContext.Provider>
  ),
  play: async ({ canvasElement }) => {
    const body = within(canvasElement.ownerDocument.body);
    const dialog = within(body.getByRole('dialog', { name: 'Search Plot' }));
    const input = dialog.getByRole('combobox');

    await userEvent.click(dialog.getByRole('radio', { name: 'Smart lists' }));
    await userEvent.type(input, 'quiet');
    const option = await dialog.findByRole('option');
    await expect(option).toHaveTextContent('The Quiet Night');
    await expect(option).toHaveTextContent('Saved films');
  },
};
