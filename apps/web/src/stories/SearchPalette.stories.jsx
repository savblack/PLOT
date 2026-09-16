import { MemoryRouter } from 'react-router-dom';
import { configure } from '@plot/core/config.js';
import { AppContext } from '../hooks/useApp.js';
import SearchPalette from '../components/SearchPalette.jsx';

/* The real palette against live TMDB via the proxy in .env: type into it and
   the rows are what the app would show. `user` is null so the friends RPC is
   never called and useHistory never touches Supabase; the watchlist stub
   marks one arbitrary id as saved so the bookmark state has something to
   show. Chosen in the browser, not hardcoded: it is whatever you save. */

configure({
  supabaseUrl: import.meta.env.VITE_SUPABASE_URL,
  supabaseAnonKey: import.meta.env.VITE_SUPABASE_ANON_KEY,
  tmdbProxyUrl: import.meta.env.VITE_TMDB_PROXY_URL,
  isDev: true,
});

const saved = new Set();
// A viewer's library, for the rows that lead the list. Titles only; TMDB ids
// are what the panel would need, and these stubs never open one, so they are
// deliberately not real ids (see AGENTS.md on never guessing TMDB ids).
const library = [
  { tmdb_id: 1, media_type: 'tv', title: 'Severance', poster_path: null },
  { tmdb_id: 2, media_type: 'movie', title: 'Dune: Part Two', poster_path: null },
];
const app = {
  user: null,
  profile: null,
  watching: { items: [library[0]] },
  openPanel: (id, type, source) => console.log('openPanel', { id, type, source }),
  watchlist: {
    items: [library[1]],
    isInList: (id) => saved.has(id),
    toggle: (item) => { saved.has(item.id) ? saved.delete(item.id) : saved.add(item.id); console.log('watchlist.toggle', item.id); },
  },
};

export default {
  title: 'Search/SearchPalette',
  component: SearchPalette,
  parameters: { layout: 'fullscreen' },
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
  render: () => <SearchPalette onClose={() => console.log('close')} />,
};
