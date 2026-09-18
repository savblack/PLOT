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
  args: { onClose: fn() },
  render: args => <SearchPalette {...args} />,
  play: async ({ args, canvasElement }) => {
    const body = within(canvasElement.ownerDocument.body);
    const dialog = body.getByRole('dialog', { name: 'Search PLOT' });
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
