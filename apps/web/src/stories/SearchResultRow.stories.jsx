import SearchResultRow from '../components/SearchResultRow.jsx';

const GENRES = [
  { id: 18, name: 'Drama' }, { id: 80, name: 'Crime' }, { id: 878, name: 'Science Fiction' },
  { id: 12, name: 'Adventure' }, { id: 9648, name: 'Mystery' }, { id: 10759, name: 'Action & Adventure' },
];

const noop = () => {};
const stubs = {
  openPanel: noop,
  watchlist: { isInList: () => false, toggle: noop },
  favorites: { isFavorite: () => false, toggleFavorite: noop },
  history:   { isWatched: () => false },
  region: 'AU',
  genres: GENRES,
};

const DUNE_2021 = {
  id: 438631, media_type: 'movie', title: 'Dune', original_title: 'Dune',
  release_date: '2021-09-15', genre_ids: [878, 12], vote_average: 7.78, vote_count: 12894,
  poster_path: '/d5NXSklXo0qyIYkgV94XAgMIckC.jpg',
};
const DUNE_1984 = {
  id: 841, media_type: 'movie', title: 'Dune', original_title: 'Dune',
  release_date: '1984-12-14', genre_ids: [878, 12], vote_average: 6.2, vote_count: 3100,
  poster_path: '/j8aVXbnKp2HXEoGGvvmSJZ1ZJlI.jpg',
};
const DUNE_2000 = {
  id: 2200, media_type: 'tv', name: 'Frank Herbert\'s Dune', original_name: 'Frank Herbert\'s Dune',
  first_air_date: '2000-12-03', genre_ids: [10759, 18], vote_average: 6.9, vote_count: 120,
  poster_path: '/uGjJ0vfvz9l3e3kSd6ZikzlN6Um.jpg',
};
const SQUID_GAME = {
  id: 93405, media_type: 'tv', name: 'Squid Game', original_name: '오징어 게임',
  first_air_date: '2021-09-17', genre_ids: [10759, 9648, 18], vote_average: 7.85, vote_count: 15000,
  poster_path: '/dDlEmu3EZ0Pgg93K2SVNLCjCSvE.jpg',
};
const SPARSE = {
  id: 1, media_type: 'movie', title: 'Untitled Project', release_date: '', genre_ids: [], vote_average: 0, vote_count: 0, poster_path: null,
};
const OBSCURE = {
  id: 2, media_type: 'movie', title: 'Dune', original_title: 'Dune',
  release_date: '2029-01-01', genre_ids: [99], vote_average: 9.5, vote_count: 6, poster_path: null, // six votes: score stays hidden
};

export default {
  title: 'Components/SearchResultRow',
  component: SearchResultRow,
  args: stubs,
  parameters: { layout: 'fullscreen' },
  decorators: [(Story) => <div style={{ maxWidth: 640, margin: '0 auto', background: 'var(--surface)' }}><Story /></div>],
};

/* The case the metadata exists for: three titles that share a name. */
export const SameNameDifferentTitles = {
  render: (args) => (
    <div>
      <SearchResultRow {...args} item={DUNE_2021} />
      <SearchResultRow {...args} item={DUNE_1984} />
      <SearchResultRow {...args} item={DUNE_2000} />
    </div>
  ),
};

export const OriginalTitleDiffers = { args: { item: SQUID_GAME } };

export const WatchedAndComingSoon = {
  render: (args) => (
    <div>
      <SearchResultRow {...args} item={DUNE_2021} history={{ isWatched: () => true }} />
      <SearchResultRow {...args} item={OBSCURE} />
    </div>
  ),
};

export const SparsePayload = { args: { item: SPARSE } };
