import assert from 'node:assert/strict';
import test from 'node:test';

import {
  classifySearchResults,
  parseSearchQuery,
  rankSearchResults,
  hasStrongTitleMatch,
  normalizeTitle,
  describeSearchResult,
  MIN_RATED_VOTES,
  placeSearchRows,
  listsPlaceSources,
  homePlaceShelves,
  matchLibrary,
  LIBRARY_MATCH_LIMIT,
  SEARCH_PLACES,
  PLACE_MATCH_LIMIT,
} from '../../search.js';

test('classifySearchResults keeps playable movie and tv results', () => {
  const result = classifySearchResults([
    { id: 1, media_type: 'movie', title: 'Inception', poster_path: '/x.jpg' },
    { id: 2, media_type: 'person', name: 'Christopher Nolan' },
  ]);

  assert.equal(result.emptyMode, 'none');
  assert.deepEqual(result.filtered.map(item => item.id), [1]);
});

test('classifySearchResults drops movie/tv results with no poster, name, or title', () => {
  const result = classifySearchResults([{ id: 1, media_type: 'movie' }]);
  assert.equal(result.emptyMode, 'generic');
  assert.deepEqual(result.filtered, []);
});

test('classifySearchResults shows title guidance when only person results remain', () => {
  const result = classifySearchResults([
    { id: 2, media_type: 'person', name: 'Christopher Nolan' },
  ]);

  assert.equal(result.emptyMode, 'title-guidance');
  assert.deepEqual(result.filtered, []);
});

test('classifySearchResults keeps the generic empty state for non-person misses', () => {
  const result = classifySearchResults([
    { id: 3, media_type: 'collection', name: 'Unknown Collection' },
  ]);

  assert.equal(result.emptyMode, 'generic');
  assert.deepEqual(result.filtered, []);
});

test('classifySearchResults defaults to an empty, generic result with no argument', () => {
  const result = classifySearchResults();
  assert.deepEqual(result, { filtered: [], emptyMode: 'generic' });
});

test('classifySearchResults treats non-array input as an empty list rather than throwing', () => {
  const result = classifySearchResults('not an array');
  assert.deepEqual(result, { filtered: [], emptyMode: 'generic' });
});

test('classifySearchResults accepts tv results with only a name, no poster_path', () => {
  const result = classifySearchResults([{ id: 4, media_type: 'tv', name: 'Breaking Bad' }]);
  assert.equal(result.emptyMode, 'none');
  assert.deepEqual(result.filtered, [{ id: 4, media_type: 'tv', name: 'Breaking Bad' }]);
});


/* ── parseSearchQuery ── */

test('parseSearchQuery reads a trailing media-type qualifier as intent', () => {
  assert.deepEqual(parseSearchQuery('7 up tv series'), {
    title: '7 up', mediaType: 'tv', year: null, rawQuery: '7 up tv series',
  });
  assert.deepEqual(parseSearchQuery('the office tv show'), {
    title: 'the office', mediaType: 'tv', year: null, rawQuery: 'the office tv show',
  });
  assert.deepEqual(parseSearchQuery('dune movie'), {
    title: 'dune', mediaType: 'movie', year: null, rawQuery: 'dune movie',
  });
  assert.deepEqual(parseSearchQuery('alien film'), {
    title: 'alien', mediaType: 'movie', year: null, rawQuery: 'alien film',
  });
});

test('parseSearchQuery reads an unambiguous leading qualifier, but not a bare one', () => {
  assert.equal(parseSearchQuery('tv series 7 up').title, '7 up');
  assert.equal(parseSearchQuery('tv series 7 up').mediaType, 'tv');
  // "Show Me a Hero" and "The Movie Critic" are titles, not intents.
  assert.equal(parseSearchQuery('show me a hero').title, 'show me a hero');
  assert.equal(parseSearchQuery('show me a hero').mediaType, null);
});

test('parseSearchQuery treats a season number as a series intent', () => {
  assert.deepEqual(parseSearchQuery('severance season 2'), {
    title: 'severance', mediaType: 'tv', year: null, rawQuery: 'severance season 2',
  });
});

test('parseSearchQuery peels stacked qualifiers in either order', () => {
  assert.equal(parseSearchQuery('the office tv series season 2').title, 'the office');
  assert.equal(parseSearchQuery('the office season 2 tv series').title, 'the office');
});

test('parseSearchQuery pulls a year out of the query', () => {
  assert.deepEqual(parseSearchQuery('the bear 2022'), {
    title: 'the bear', mediaType: null, year: 2022, rawQuery: 'the bear 2022',
  });
  assert.deepEqual(parseSearchQuery('Dune (2021)'), {
    title: 'Dune', mediaType: null, year: 2021, rawQuery: 'Dune (2021)',
  });
});

test('parseSearchQuery leaves a leading year alone — 2012 and 1917 are titles', () => {
  assert.deepEqual(parseSearchQuery('1917'), {
    title: '1917', mediaType: null, year: null, rawQuery: '1917',
  });
});

test('parseSearchQuery keeps a query that is nothing but a qualifier', () => {
  for (const query of ['the movie', 'movie', 'the series', 'a film']) {
    assert.deepEqual(parseSearchQuery(query), {
      title: query, mediaType: null, year: null, rawQuery: query,
    });
  }
});

test('parseSearchQuery normalises whitespace and survives empty input', () => {
  assert.equal(parseSearchQuery('  the   office  tv show ').title, 'the office');
  assert.deepEqual(parseSearchQuery(), { title: '', mediaType: null, year: null, rawQuery: '' });
});

/* ── normalizeTitle ── */

test('normalizeTitle folds case, accents, punctuation and ampersands', () => {
  assert.equal(normalizeTitle('WALL·E'), 'wall e');
  assert.equal(normalizeTitle('Law & Order'), 'law and order');
  assert.equal(normalizeTitle("Schitt's Creek"), 'schitts creek');
  assert.equal(normalizeTitle('Amélie'), 'amelie');
});

/* ── rankSearchResults ── */

test('rankSearchResults puts an exact title match above a more popular near-miss', () => {
  const ranked = rankSearchResults([
    { id: 1, media_type: 'tv', name: 'The Office Movers', popularity: 500 },
    { id: 2, media_type: 'tv', name: 'The Office', popularity: 9 },
  ], { title: 'the office', rawQuery: 'the office tv show', mediaType: 'tv' });

  assert.deepEqual(ranked.map(r => r.id), [2, 1]);
});

test('rankSearchResults falls back to popularity when nothing matches textually', () => {
  // "7 Up" is on TMDB as "The Up Series" — no title heuristic finds it, so
  // TMDB's own popularity has to be the tiebreak.
  const ranked = rankSearchResults([
    { id: 1, media_type: 'tv', name: 'Wake Up 7', popularity: 0.49 },
    { id: 2, media_type: 'tv', name: 'The Up Series', popularity: 5.69 },
  ], { title: '7 up', rawQuery: '7 up tv series', mediaType: 'tv' });

  assert.deepEqual(ranked.map(r => r.id), [2, 1]);
});

test('rankSearchResults prefers the asked-for media type', () => {
  const ranked = rankSearchResults([
    { id: 1, media_type: 'movie', title: 'Severance', popularity: 12 },
    { id: 2, media_type: 'tv', name: 'Severance', popularity: 8 },
  ], { title: 'severance', rawQuery: 'severance season 2', mediaType: 'tv' });

  assert.deepEqual(ranked.map(r => r.id), [2, 1]);
});

test('rankSearchResults lets an exact raw-query match beat the type intent', () => {
  // "the truman show" parses as a tv intent, but the movie is what was meant.
  const ranked = rankSearchResults([
    { id: 1, media_type: 'tv', name: 'The Eternal Christ - Truman G. Madsen', popularity: 0.7 },
    { id: 2, media_type: 'movie', title: 'The Truman Show', popularity: 0.4 },
  ], { title: 'the truman', rawQuery: 'the truman show', mediaType: 'tv' });

  assert.deepEqual(ranked.map(r => r.id), [2, 1]);
});

test('rankSearchResults boosts a matching year and demotes a mismatched one', () => {
  const ranked = rankSearchResults([
    { id: 1, media_type: 'tv', name: 'The Bear', first_air_date: '2010-01-01', popularity: 90 },
    { id: 2, media_type: 'tv', name: 'The Bear', first_air_date: '2022-06-23', popularity: 3 },
  ], { title: 'the bear', rawQuery: 'the bear 2022', year: 2022 });

  assert.deepEqual(ranked.map(r => r.id), [2, 1]);
});

test('rankSearchResults matches on the original title too', () => {
  const ranked = rankSearchResults([
    { id: 1, media_type: 'movie', title: 'Filler', popularity: 40 },
    { id: 2, media_type: 'movie', title: 'Spirited Away', original_title: 'Sen to Chihiro', popularity: 1 },
  ], { title: 'sen to chihiro', rawQuery: 'sen to chihiro' });

  assert.deepEqual(ranked.map(r => r.id), [2, 1]);
});

test('rankSearchResults returns a new array and tolerates junk input', () => {
  const input = [{ id: 1, media_type: 'movie', title: 'A' }];
  assert.notEqual(rankSearchResults(input, { title: 'a' }), input);
  assert.deepEqual(rankSearchResults(undefined), []);
  assert.deepEqual(rankSearchResults('not an array', { title: 'a' }), []);
});

/* ── hasStrongTitleMatch ── */

test('hasStrongTitleMatch only counts an exact or starts-with match', () => {
  assert.equal(hasStrongTitleMatch([{ name: 'The Office' }], 'the office'), true);
  assert.equal(hasStrongTitleMatch([{ name: 'The Office Movers' }], 'the office'), true);
  // Contains the words, but does not lead with them.
  assert.equal(hasStrongTitleMatch([{ name: 'Quiet in the Office' }], 'the office'), false);
  assert.equal(hasStrongTitleMatch([{ name: 'Glass House' }], 'the truman'), false);
  assert.equal(hasStrongTitleMatch([], 'the office'), false);
  assert.equal(hasStrongTitleMatch([{ name: 'The Office' }], ''), false);
});

test('describeSearchResult surfaces year, genres and rating from the search payload', () => {
  const genres = [{ id: 18, name: 'Drama' }, { id: 80, name: 'Crime' }, { id: 53, name: 'Thriller' }];
  const meta = describeSearchResult({
    title: 'Heat',
    original_title: 'Heat',
    release_date: '1995-12-15',
    genre_ids: [80, 18, 53],
    vote_average: 7.912,
    vote_count: 6000,
  }, genres);

  assert.deepEqual(meta, {
    year: '1995',
    genres: ['Crime', 'Drama'],
    rating: '7.9',
    originalTitle: null,
  });
});

test('describeSearchResult hides a rating with too few votes and unknown genre ids', () => {
  const meta = describeSearchResult({
    name: 'Obscure Pilot',
    first_air_date: '2024-01-01',
    genre_ids: [999],
    vote_average: 9.5,
    vote_count: MIN_RATED_VOTES - 1,
  }, [{ id: 18, name: 'Drama' }]);

  assert.equal(meta.year, '2024');
  assert.deepEqual(meta.genres, []);
  assert.equal(meta.rating, null);
});

test('describeSearchResult shows the original title only when it really differs', () => {
  const differs = describeSearchResult({ name: 'Squid Game', original_name: '오징어 게임' });
  assert.equal(differs.originalTitle, '오징어 게임');

  const accentOnly = describeSearchResult({ title: 'Amelie', original_title: 'Amélie' });
  assert.equal(accentOnly.originalTitle, null);

  const empty = describeSearchResult({});
  assert.deepEqual(empty, { year: '', genres: [], rating: null, originalTitle: null });
});

// ── Search in one place ──
// Symbolic identifiers are local fixtures, never TMDB lookup IDs.

test('placeSearchRows: lists carry the list name, status and a forced media type', () => {
  const rows = placeSearchRows('lists', { lists: [
    { name: '', status: 'watching', mediaType: 'tv', items: [{ tmdb_id: 'fx-a', title: 'Quiet Days' }] },
    { name: 'Rainy Sunday', items: [{ tmdb_id: 'fx-b', media_type: 'movie', name: 'The Quiet Night', poster_path: '/p.jpg' }] },
    { name: 'Empty' },
  ] });
  assert.deepEqual(rows, [
    { where: '', status: 'watching', media_type: 'tv', tmdb_id: 'fx-a', title: 'Quiet Days', poster_path: null },
    { where: 'Rainy Sunday', media_type: 'movie', tmdb_id: 'fx-b', title: 'The Quiet Night', poster_path: '/p.jpg' },
  ]);
});

test('placeSearchRows: smart lists carry the smart list name', () => {
  const rows = placeSearchRows('smart', { lists: [{ name: 'Short thrillers', items: [{ tmdb_id: 'fx-s', media_type: 'movie', title: 'Quiet Hour' }] }] });
  assert.deepEqual(rows, [{ where: 'Short thrillers', media_type: 'movie', tmdb_id: 'fx-s', title: 'Quiet Hour', poster_path: null }]);
});

test('placeSearchRows: history rows are all watched', () => {
  const [row] = placeSearchRows('history', { history: [{ tmdb_id: 'fx-a', media_type: 'tv', title: 'Quiet Days' }] });
  assert.equal(row.status, 'watched');
  assert.equal(row.media_type, 'tv');
});

test('placeSearchRows: calendar keeps dated titles from today on and drops reminders', () => {
  const item = { tmdb_id: 'fx-a', media_type: 'tv', title: 'Quiet Days' };
  const rows = placeSearchRows('calendar', {
    todayStr: '2026-11-16',
    calendarEvents: [
      { date: '2026-11-10', label: 'S1 E1', item },
      { date: '2026-11-16', label: 'S1 E2', item },
      { date: '2026-11-20', label: 'Reminder', item: { tmdb_id: null, title: 'Quiet Days' } },
    ],
  });
  assert.equal(rows.length, 1);
  assert.equal(rows[0].date, '2026-11-16');
  assert.equal(rows[0].where, 'S1 E2');
});

test('placeSearchRows: home reads TMDB shelf results and skips people', () => {
  const rows = placeSearchRows('home', { shelves: [
    [{ id: 'fx-a', media_type: 'tv', name: 'Quiet Days' }, { id: 'fx-p', media_type: 'person', name: 'Quiet Person' }],
    [{ id: 'fx-b', title: 'The Quiet Night' }],
  ] });
  assert.deepEqual(rows.map(r => [r.tmdb_id, r.media_type, r.title]), [
    ['fx-a', 'tv', 'Quiet Days'],
    ['fx-b', 'movie', 'The Quiet Night'],
  ]);
});

test('placeSearchRows: everywhere and unknown places have no rows', () => {
  assert.deepEqual(placeSearchRows('everywhere', { history: [{ tmdb_id: 'fx-a', title: 'x' }] }), []);
  assert.deepEqual(placeSearchRows('nowhere'), []);
});

test('a place search matches through matchLibrary, one row per title, up to the place limit', () => {
  const item = { tmdb_id: 'fx-a', media_type: 'tv', title: 'Quiet Days' };
  const rows = placeSearchRows('calendar', {
    todayStr: '2026-11-16',
    calendarEvents: [
      { date: '2026-11-17', label: 'S1 E2', item },
      { date: '2026-11-24', label: 'S1 E3', item },
    ],
  });
  const found = matchLibrary('quiet', rows, { limit: PLACE_MATCH_LIMIT });
  assert.equal(found.length, 1);
  assert.equal(found[0].data.date, '2026-11-17');
  assert.ok(PLACE_MATCH_LIMIT > LIBRARY_MATCH_LIMIT);
  assert.deepEqual(SEARCH_PLACES, ['everywhere', 'home', 'calendar', 'lists', 'smart', 'history']);
});

test('listsPlaceSources: My Lists order, Top 5 capped, favorites only when on', () => {
  const lists = listsPlaceSources({
    watching: [{ tmdb_id: 'fx-w', title: 'Quiet Days' }],
    topMovies: [{ tmdb_id: 'fx-t1', title: 'One', rank: 1 }, { tmdb_id: 'fx-t6', title: 'Six', rank: 6 }],
    topTv: [],
    want: [{ tmdb_id: 'fx-s', title: 'Saved' }],
    favorites: null,
    customLists: [{ name: 'Rainy Sunday', items: [{ tmdb_id: 'fx-c', title: 'Custom' }] }],
    labels: { top: 'Top 5', want: 'Watchlist' },
    topSize: 5,
  });
  assert.deepEqual(lists.map(l => [l.name, (l.items || []).length]), [['', 1], ['Top 5', 1], ['Top 5', 0], ['Watchlist', 1], ['Rainy Sunday', 1]]);
  const rows = placeSearchRows('lists', { lists });
  assert.deepEqual(rows.map(r => [r.title, r.where, r.media_type]), [
    ['Quiet Days', '', 'tv'], ['One', 'Top 5', 'movie'], ['Saved', 'Watchlist', 'movie'], ['Custom', 'Rainy Sunday', 'movie'],
  ]);
  assert.equal(listsPlaceSources({ favorites: [{ tmdb_id: 'fx-f', title: 'Fav' }] }).length, 5);
});

test('homePlaceShelves: watching first, then the Discover shelves, gaps tolerated', () => {
  const shelves = homePlaceShelves({ hero: { id: 'fx-h', title: 'Hero' }, hotRail: [{ id: 'fx-r', name: 'Rail', media_type: 'tv' }], weekly: null }, [{ tmdb_id: 'fx-w', title: 'Quiet Days' }]);
  assert.deepEqual(placeSearchRows('home', { shelves }).map(r => [r.tmdb_id, r.media_type]), [['fx-w', 'tv'], ['fx-h', 'movie'], ['fx-r', 'tv']]);
  assert.deepEqual(placeSearchRows('home', { shelves: homePlaceShelves(null) }), []);
});
