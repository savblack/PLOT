import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { AppContext } from '../hooks/useApp.js';
import MyListsView from '../components/MyListsView.jsx';
import ListPage from '../components/ListPage.jsx';

/* The whole My Lists page with stubbed data, so its layout can be seen
   without a signed-in session. Poster paths are deliberately absent: a TMDB
   path is opaque and must come from a real response, so the cards render
   their title placeholders instead. */

const noop = () => {};
const resolved = () => Promise.resolve(true);

const title = (id, name, media_type = 'movie', extra = {}) => ({
  id: `row-${id}`, tmdb_id: id, title: name, media_type, poster_path: null, ...extra,
});

const watchingItems = [
  { tmdb_id: 1, title: 'Severance', current_season: 2, current_episode: 4, total_episodes: 10 },
  { tmdb_id: 2, title: 'The White Lotus', current_season: 3, current_episode: 1, total_episodes: 8 },
  { tmdb_id: 3, title: 'Slow Horses', current_season: 4, current_episode: 6, total_episodes: 6 },
];

const watchlistItems = [
  title(11, 'Parasomnia'),
  title(12, 'Reacher', 'tv'),
  title(13, 'Wicked: For Good', 'movie', { release_date: '2026-11-20' }),
  title(14, 'The Bear', 'tv', { streaming_date: '2026-09-25' }),
  title(15, 'Dune: Part Three', 'movie', { release_date: '2026-12-18' }),
  title(16, 'Andor', 'tv'),
  title(17, 'A very long movie title that wraps onto two lines and then clips'),
  title(18, 'Heretic'),
];

const favoritesItems = Array.from({ length: 9 }, (_, i) => title(100 + i, ['Aftersun', 'Clueless', 'Scream', 'The Housemaid', 'Love Story', 'Adolescence', 'Past Lives', 'Anora', 'Heat'][i], i % 3 === 0 ? 'tv' : 'movie'));

const customLists = [
  { id: 'l1', name: 'Rainy Sundays', is_public: true,  items: Array.from({ length: 14 }, (_, i) => title(200 + i, `Comfort watch ${i + 1}`)) },
  { id: 'l2', name: 'With Mum',      is_public: false, items: [title(300, 'Paddington 2'), title(301, 'The Holdovers')] },
  { id: 'l3', name: 'Empty list',    is_public: false, items: [] },
];

const topMovies = [
  { rank: 1, tmdb_id: 401, title: 'Heat', media_type: 'movie', poster_path: null },
  { rank: 2, tmdb_id: 402, title: 'Aftersun', media_type: 'movie', poster_path: null },
  { rank: 3, tmdb_id: 403, title: 'Past Lives', media_type: 'movie', poster_path: null },
  { rank: 4, tmdb_id: 404, title: 'Anora', media_type: 'movie', poster_path: null },
];

/* useHistory(undefined) never queries, so the user has no id on purpose and
   the Recently Watched rail shows its empty line here. The history card
   itself is in ListCards.stories.jsx. */
const app = {
  user: { email: 'story@example.com' },
  profile: { region: 'AU' },
  openPanel: noop,
  navigateTo: noop,
  topLists:    { lists: { movies: topMovies, tv: [] }, loading: false, setSlot: resolved, removeSlot: resolved, moveUp: resolved, moveDown: resolved },
  favorites:   { favorites: favoritesItems, loading: false, isFavorite: () => false, toggleFavorite: resolved },
  customLists: { lists: customLists, loading: false, createList: resolved, deleteList: resolved, renameList: resolved, setListPublic: resolved, addItem: resolved, removeItem: resolved },
  watching:    { items: watchingItems, loading: false, stopWatching: resolved, fetchSeason: async () => null },
  watchlist:   { items: watchlistItems, loading: false, removeFromList: resolved, isInList: () => false, toggle: resolved },
};

const emptyApp = {
  ...app,
  topLists:    { ...app.topLists, lists: { movies: [], tv: [] } },
  favorites:   { ...app.favorites, favorites: [] },
  customLists: { ...app.customLists, lists: [] },
  watching:    { ...app.watching, items: [] },
  watchlist:   { ...app.watchlist, items: [] },
};

export default {
  title: 'Views/MyListsView',
  component: MyListsView,
  parameters: { layout: 'fullscreen', app },
  decorators: [
    (Story, context) => (
      <MemoryRouter initialEntries={[context.parameters.route ?? '/my-lists']}>
        <AppContext.Provider value={context.parameters.app}>
          <div className="app-main-inner" style={{ padding: '1rem 0 3rem' }}>
            <Story />
          </div>
        </AppContext.Provider>
      </MemoryRouter>
    ),
  ],
};

export const Populated = {};

export const AllEmpty = { parameters: { app: emptyApp } };

// Empty custom lists exercise the allowance without fabricated media identities.
const allowanceApp = (count) => ({
  ...emptyApp,
  customLists: {
    ...emptyApp.customLists,
    lists: Array.from({ length: count }, (_, i) => ({ id: `allowance-${i}`, name: `My list ${i + 1}`, items: [] })),
  },
});

export const FourCustomLists = { parameters: { app: allowanceApp(4) } };
export const FiveCustomLists = { parameters: { app: allowanceApp(5) } };

/* A Premium-sized collection: past the column's cap, so the index folds to a
   "View more" row instead of running the column off the page. Twelve custom
   lists plus the two built-ins is fourteen rows; the column shows eight. */
export const ManyLists = {
  parameters: {
    app: {
      ...app,
      customLists: {
        ...app.customLists,
        lists: Array.from({ length: 12 }, (_, i) => ({
          id: `many-${i}`,
          name: `List number ${i + 1}`,
          items: [title(500 + i, `Title ${i + 1}`)],
        })),
      },
    },
  },
};
export const StaleListCount = {
  parameters: {
    app: {
      ...allowanceApp(4),
      customLists: {
        ...allowanceApp(4).customLists,
        createList: async () => { throw Object.assign(new Error('List cap'), { code: 'custom_list_limit_reached' }); },
      },
    },
  },
};

/* A cover, opened: the list page at its route. The shared decorator reads
   `parameters.route` for the router's starting entry. */
const listPage = (route) => ({
  parameters: { route },
  render: () => <Routes><Route path="/my-lists/:key" element={<ListPage />} /></Routes>,
});

export const CustomListPage  = listPage('/my-lists/list-l1');
export const WantToWatchPage = listPage('/my-lists/want');
