import resolvedTitles from './profileTitles.fixture.json';
import { MemoryRouter } from 'react-router-dom';
import { AppContext } from '../hooks/useApp.js';
import { tasteOverlap } from '@plot/core/tasteOverlap.js';
import { TasteOverlapView } from '../pages/TasteOverlapPage.jsx';
import TasteShareDialog from '../components/TasteShareDialog.jsx';

// Titles, ids and posters come from the TMDB-resolved fixture the profile
// stories use. Ratings, release years and people are fictional. Genre keys are
// story-local labels, never looked up against TMDB.
const GENRES = new Map([[1, 'Drama'], [2, 'Comedy'], [3, 'Thriller'], [4, 'Animation'], [5, 'Romance']]);
const years = ['2023-06-02', '2022-10-21', '2014-01-01', '1994-05-05', '2017-11-11', '1999-03-03'];
const genreSets = [[1, 5], [1], [2, 1], [3], [4, 2], [1, 3]];
const mineRatings = [10, 9, 8, 2, 7, 9];
const theirRatings = [9, 10, 4, 9, 7, 8];

const rows = (ratings) => resolvedTitles.map((t, i) => ({
  ...t, rating: ratings[i], genre_ids: genreSets[i], release_date: years[i],
}));
// A handful of titles only one of you has seen, so the Venn has three parts.
const extra = (prefix, n, year) => Array.from({ length: n }, (_, i) => ({
  tmdb_id: `${prefix}-${i}`, media_type: 'movie', title: `${prefix} ${i}`, poster_path: null,
  rating: null, genre_ids: [1 + (i % 4)], release_date: year,
}));

const overlap = tasteOverlap(
  [...rows(mineRatings), ...extra('mine', 14, '2016-01-01')],
  [...rows(theirRatings), ...extra('theirs', 9, '1997-01-01')],
);
const publicTarget = { id: 'sam', username: 'sam', display_name: 'Sam', avatar_url: null, is_public: true };
const privateTarget = { ...publicTarget, is_public: false };

const app = { profile: { region: 'AU', is_premium: true } };

export default {
  title: 'Views/TasteOverlapPage',
  component: TasteOverlapView,
  parameters: { layout: 'fullscreen' },
  args: {
    username: 'sam', premium: true, loading: false, error: null, target: publicTarget, overlap,
    sharedWatchlist: 14, genreName: GENRES, onRetry: () => {}, openPanel: () => {}, upsellFrom: '/u/sam/compare',
  },
  decorators: [(Story) => (
    <MemoryRouter>
      <AppContext.Provider value={app}>
        <div style={{ minHeight: '100vh', background: 'var(--bg)', fontFamily: 'var(--font-sans)', color: 'var(--text-primary)' }}><Story /></div>
      </AppContext.Provider>
    </MemoryRouter>
  )],
};

export const Populated = {};
export const PrivateFriend = { args: { target: privateTarget, sharedWatchlist: null } };
export const NotEnoughRatings = { args: { overlap: tasteOverlap(rows(mineRatings).slice(0, 3), rows(theirRatings).slice(0, 3)) } };
export const FreeViewer = { args: { premium: false } };
export const NotVisible = { args: { error: 'not_visible', target: null, overlap: null } };

export const ShareCard = {
  render: () => <TasteShareDialog overlap={overlap} target={publicTarget} genreName={GENRES} onClose={() => {}} />,
};
export const ShareCardPrivateFriend = {
  render: () => <TasteShareDialog overlap={overlap} target={privateTarget} genreName={GENRES} onClose={() => {}} />,
};
