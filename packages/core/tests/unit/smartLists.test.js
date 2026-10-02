import assert from 'node:assert/strict';
import test from 'node:test';
import {
  defaultSmartListRules,
  normalizeSmartListRules,
  isSmartList,
  evaluateSmartListRules,
  smartListLibrary,
  smartListGenres,
  smartListPickerOptions,
  smartListSummary,
  loadLibraryMatches,
  loadDiscoverMatches,
  watchedIdsFromHistory,
  SMART_LIST_DETAIL_LIMIT,
  smartListInRollUp,
  smartListRollUpEligible,
} from '../../smartLists.js';
import { _resetPickerCache } from '../../tonightPicker.js';

// Ids here are opaque fixture values fed to a fake client, never real TMDB lookups.
const DRAMA = 18;
const COMEDY = 35;
const FAMILY = 10751;
const NEWS = 10763;
const NETFLIX = 8;

const rules = (over = {}) => normalizeSmartListRules({ ...defaultSmartListRules(), ...over });

test('a list is smart only when it has a rules object', () => {
  assert.equal(isSmartList({ rules: null }), false);
  assert.equal(isSmartList({}), false);
  assert.equal(isSmartList({ rules: [] }), false);
  assert.equal(isSmartList({ rules: { source: 'discover' } }), true);
});

test('normalizing falls back to defaults and clears rules that do not apply', () => {
  const r = normalizeSmartListRules({ source: 'nope', mediaType: 'book', era: '1800s', minScore: 9.5, genreIds: [DRAMA, '35', -53, 'x', DRAMA] });
  assert.equal(r.source, 'discover');
  assert.equal(r.mediaType, 'movie');
  assert.equal(r.era, 'any');
  assert.equal(r.minScore, null);
  assert.deepEqual(r.genreIds, [DRAMA, COMEDY]);

  // Length reads as minutes per movie or per episode, so both types drop it.
  assert.equal(normalizeSmartListRules({ mediaType: 'any', maxRuntime: 90 }).maxRuntime, null);
  assert.equal(normalizeSmartListRules({ mediaType: 'movie', maxRuntime: 90 }).maxRuntime, 90);
  assert.equal(normalizeSmartListRules({ mediaType: 'movie', maxRuntime: 45 }).maxRuntime, null);
  assert.equal(normalizeSmartListRules({ mediaType: 'tv', maxRuntime: 45 }).maxRuntime, 45);

  // Your own rating only means something for what you've watched.
  assert.equal(normalizeSmartListRules({ source: 'watchlist', minMyRating: 8 }).minMyRating, null);
  const history = normalizeSmartListRules({ source: 'history', minMyRating: 8, hideWatched: true });
  assert.equal(history.minMyRating, 8);
  assert.equal(history.hideWatched, false, 'history is everything watched, so it never hides watched');
  assert.equal(normalizeSmartListRules({ source: 'discover' }).hideWatched, true);
  assert.equal(normalizeSmartListRules(null), null);
});

test('evaluate: a clear miss is false, a missing field is unknown (null)', () => {
  const r = rules({ mediaType: 'movie', genreIds: [DRAMA], era: '2010s', minScore: 7 });
  assert.equal(evaluateSmartListRules({ media_type: 'tv', genre_ids: [DRAMA] }, r), false);
  assert.equal(evaluateSmartListRules({ media_type: 'movie', genre_ids: [COMEDY], release_date: '2015-01-01', vote_average: 8 }, r), false);
  assert.equal(evaluateSmartListRules({ media_type: 'movie', genre_ids: [DRAMA], release_date: '2001-01-01', vote_average: 8 }, r), false);
  assert.equal(evaluateSmartListRules({ media_type: 'movie', genre_ids: [DRAMA], release_date: '2015-01-01', vote_average: 6.9 }, r), false);
  assert.equal(evaluateSmartListRules({ media_type: 'movie', genre_ids: [DRAMA], release_date: '2015-01-01' }, r), null);
  assert.equal(evaluateSmartListRules({ media_type: 'movie', release_date: '2015-01-01', vote_average: 8 }, r), null);
  assert.equal(evaluateSmartListRules({ media_type: 'movie', genre_ids: [DRAMA], release_date: '2015-01-01', vote_average: 8 }, r), true);
});

test('evaluate: services and my rating', () => {
  const services = rules({ onlyServices: true });
  assert.equal(evaluateSmartListRules({ media_type: 'movie' }, services, { providerIds: [NETFLIX] }), null);
  assert.equal(evaluateSmartListRules({ media_type: 'movie', provider_ids: [] }, services, { providerIds: [NETFLIX] }), false);
  assert.equal(evaluateSmartListRules({ media_type: 'movie', provider_ids: [NETFLIX] }, services, { providerIds: [NETFLIX] }), true);

  const rated = rules({ source: 'history', mediaType: 'any', minMyRating: 8 });
  assert.equal(evaluateSmartListRules({ media_type: 'tv', my_rating: 8 }, rated), true);
  assert.equal(evaluateSmartListRules({ media_type: 'movie', my_rating: 6 }, rated), false);
  assert.equal(evaluateSmartListRules({ media_type: 'movie', my_rating: null }, rated), false);
});

test('the library is one row per title, newest first, keeping the best rating', () => {
  const r = rules({ source: 'history', mediaType: 'any' });
  const lib = smartListLibrary(r, { historyEntries: [
    { tmdb_id: 900001, media_type: 'movie', title: 'A', rating: 8, watched_at: '2026-01-01' },
    { tmdb_id: 900001, media_type: 'movie', title: 'A', rating: 4, watched_at: '2026-03-01' },
    { tmdb_id: 900001, media_type: 'tv', title: 'A show', watched_at: '2026-02-01' },
    { tmdb_id: 'nope', media_type: 'movie' },
  ] });
  assert.deepEqual(lib.map(c => [c.media_type, c.tmdb_id, c.my_rating]), [['movie', 900001, 8], ['tv', 900001, null]]);
});

test('genres: TV leaves out news, talk and soap; both types merge', () => {
  const catalog = { movie: [{ id: DRAMA, name: 'Drama' }, { id: COMEDY, name: 'Comedy' }], tv: [{ id: DRAMA, name: 'Drama' }, { id: NEWS, name: 'News' }] };
  assert.deepEqual(smartListGenres(catalog, 'tv').map(g => g.id), [DRAMA]);
  assert.deepEqual(smartListGenres(catalog, 'any').map(g => g.name), ['Comedy', 'Drama']);
});

test('picker options: kids stay out unless a kids genre is the rule', () => {
  assert.equal(smartListPickerOptions(rules(), 'movie', { hideKids: true }).hideKids, true);
  assert.equal(smartListPickerOptions(rules({ genreIds: [FAMILY] }), 'movie', { hideKids: true }).hideKids, false);
  const tv = smartListPickerOptions(rules({ mediaType: 'tv', maxRuntime: 30 }), 'tv');
  assert.equal(tv.maxEpisodeRuntime, 30);
  assert.equal(tv.maxRuntime, null);
});

test('summary reads the rules back in a few words', () => {
  const r = rules({ mediaType: 'movie', genreIds: [DRAMA, COMEDY], era: '2010s', minScore: 7, onlyServices: true });
  assert.equal(
    smartListSummary(r, { genres: [{ id: DRAMA, name: 'Drama' }, { id: COMEDY, name: 'Comedy' }] }),
    'New discoveries · Movies · Drama or Comedy · 2010s · TMDB 7+ · My services',
  );
  assert.doesNotMatch(smartListSummary(r), /—/);
});

test('library matches: stored fields decide first, details fill the gaps', async () => {
  _resetPickerCache();
  const calls = [];
  const client = {
    getMovieDetails: async (id) => {
      calls.push(id);
      return { runtime: id === 900002 ? 200 : 100, genres: [{ id: DRAMA }], release_date: '2015-01-01', vote_average: 7 };
    },
  };
  const r = rules({ source: 'watchlist', mediaType: 'movie', genreIds: [DRAMA], maxRuntime: 120 });
  const { items, unchecked } = await loadLibraryMatches({
    rules: r, client, gapMs: 0,
    watchlistItems: [
      { tmdb_id: 900001, media_type: 'movie', title: 'Fits', genre_ids: [DRAMA], created_at: '2026-03-01' },
      { tmdb_id: 900002, media_type: 'movie', title: 'Too long', genre_ids: [DRAMA], created_at: '2026-02-01' },
      { tmdb_id: 900003, media_type: 'movie', title: 'Wrong genre', genre_ids: [COMEDY], created_at: '2026-01-01' },
      { tmdb_id: 900004, media_type: 'tv', title: 'A show', genre_ids: [DRAMA] },
    ],
  });
  assert.deepEqual(items.map(i => i.title), ['Fits']);
  assert.deepEqual(calls.sort(), [900001, 900002], 'a clear miss never costs a details call');
  assert.equal(unchecked, 0);
});

test('library matches: details are capped, and watched titles can be left out', async () => {
  _resetPickerCache();
  let calls = 0;
  const client = { getMovieDetails: async () => { calls += 1; return { runtime: 100, genres: [], vote_average: 8 }; } };
  const watchlistItems = Array.from({ length: SMART_LIST_DETAIL_LIMIT + 5 }, (_, i) => ({ tmdb_id: 910000 + i, media_type: 'movie', title: `t${i}` }));
  const r = rules({ source: 'watchlist', minScore: 7 });
  const watched = watchedIdsFromHistory([{ tmdb_id: 910000, media_type: 'movie' }]);
  const { items, unchecked } = await loadLibraryMatches({ rules: r, client, gapMs: 0, watchlistItems, watched });
  assert.equal(calls, SMART_LIST_DETAIL_LIMIT);
  assert.equal(unchecked, 4);
  assert.equal(items.length, SMART_LIST_DETAIL_LIMIT);
  assert.equal(items.some(i => i.tmdb_id === 910000), false);
});

test('library matches without details rules make no requests', async () => {
  _resetPickerCache();
  const client = { getMovieDetails: async () => { throw new Error('should not be called'); } };
  const r = rules({ source: 'history', mediaType: 'any', minMyRating: 8 });
  const { items } = await loadLibraryMatches({ rules: r, client, historyEntries: [
    { tmdb_id: 900001, media_type: 'movie', title: 'Loved', rating: 9 },
    { tmdb_id: 900002, media_type: 'tv', title: 'Fine', rating: 5 },
  ] });
  assert.deepEqual(items.map(i => i.title), ['Loved']);
});

test('discover matches interleave both types, skip watched and never repeat', async () => {
  const page = (prefix, n) => ({ results: Array.from({ length: n }, (_, i) => ({ id: prefix + i, title: `${prefix}-${i}`, name: `${prefix}-${i}`, poster_path: '/p.jpg', genre_ids: [DRAMA] })), total_pages: 2 });
  const sent = [];
  const client = {
    discoverMovies: async (params) => { sent.push(['movie', params]); return page(920000, 3); },
    discoverTV: async (params) => { sent.push(['tv', params]); return page(930000, 2); },
  };
  const r = rules({ mediaType: 'any', genreIds: [DRAMA], onlyServices: true });
  const watched = watchedIdsFromHistory([{ tmdb_id: 920001, media_type: 'movie' }]);
  const seen = new Set();
  const first = await loadDiscoverMatches({ rules: r, client, watched, providerIds: [NETFLIX], region: 'AU', seen });
  assert.deepEqual(first.items.map(i => `${i.media_type}:${i.tmdb_id}`), ['movie:920000', 'tv:930000', 'movie:920002', 'tv:930001']);
  assert.equal(first.hasMore, true);
  assert.equal(sent[0][1].with_genres, String(DRAMA));
  assert.equal(sent[0][1].with_watch_providers, String(NETFLIX));
  assert.equal(sent[0][1].watch_region, 'AU');

  const again = await loadDiscoverMatches({ rules: r, client, watched, providerIds: [NETFLIX], region: 'AU', seen, page: 2 });
  assert.equal(again.items.length, 0, 'a title already shown is not shown twice');
  assert.equal(again.hasMore, false);
});

test('the weekly roll-up includes new-discoveries lists unless switched off', () => {
  const discover = { rules: { source: 'discover', mediaType: 'movie' } };
  assert.equal(smartListInRollUp(discover), true, 'on by default, before the column is read');
  assert.equal(smartListInRollUp({ ...discover, digest_enabled: true }), true);
  assert.equal(smartListInRollUp({ ...discover, digest_enabled: false }), false);
  assert.equal(smartListInRollUp({ rules: { source: 'watchlist' } }), false, 'own titles are never in it');
  assert.equal(smartListInRollUp({ rules: { source: 'history' }, digest_enabled: true }), false);
  assert.equal(smartListInRollUp({ rules: null }), false, 'a manual list');
  assert.equal(smartListInRollUp(null), false);
  assert.equal(smartListRollUpEligible(normalizeSmartListRules({ source: 'discover' })), true);
  assert.equal(smartListRollUpEligible(null), false);
});
