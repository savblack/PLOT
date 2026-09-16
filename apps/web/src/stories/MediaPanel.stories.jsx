import { MemoryRouter } from 'react-router-dom';
import { configure } from '@plot/core/config.js';
import { AppContext } from '../hooks/useApp.js';
import MediaPanel from '../components/MediaPanel.jsx';

// The panel fetches real TMDB data through the proxy, so the story shows what
// a signed-out visitor would see for a live title. Only reads happen: the
// stub context never reaches Supabase because `user` has no id.
configure({
  supabaseUrl: import.meta.env.VITE_SUPABASE_URL,
  supabaseAnonKey: import.meta.env.VITE_SUPABASE_ANON_KEY,
  tmdbProxyUrl: import.meta.env.VITE_TMDB_PROXY_URL,
  watchAvailabilityUrl: `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/watch-availability`,
  criticScoreUrl: `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/critic-score`,
  isDev: true,
});

const noop = () => {};
const never = () => false;
const app = {
  user: null,
  profile: null,
  openPanel: noop,
  watchlist: { items: [], isInList: never, toggle: noop, removeFromList: noop },
  watching: { isWatching: never, getProgress: () => null, startWatching: noop, stopWatching: noop, setProgress: noop, markEpisodeWatched: noop },
  favorites: { isFavorite: never, toggleFavorite: noop },
  customLists: { lists: [], createList: noop, addItem: noop, removeItem: noop, isInList: never },
  topLists: { slots: [], setSlot: noop, removeSlot: noop },
};

export default {
  title: 'Panels/MediaPanel',
  component: MediaPanel,
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
  args: { closing: false, onClose: noop },
};

/** New cable series: TMDB has no streaming offers in any region and no votes yet. */
export const NoProvidersNoVotes = {
  args: { itemId: 262486, itemType: 'tv' },
};

/** Established series with streaming offers and an audience score. */
export const WithProviders = {
  args: { itemId: 1396, itemType: 'tv' },
};

/** Movie with rent/buy offers. */
export const Movie = {
  args: { itemId: 438631, itemType: 'movie' },
};
