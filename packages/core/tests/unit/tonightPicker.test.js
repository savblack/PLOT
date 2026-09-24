import assert from 'node:assert/strict';
import test from 'node:test';
import {
  pickerProviderIds,
  regionFlatrate,
  defaultPickerOptions,
  discoverParams,
  matchesOptions,
  drawFromPool,
  loadWatchlistPool,
  loadDiscoverPage,
  pickerGenres,
  _resetPickerCache,
} from '../../tonightPicker.js';

// Ids here are opaque fixture values fed to a fake client, never real TMDB lookups.
const NETFLIX = 8;
const STAN = 21;
const DRAMA = 18;
const COMEDY = 35;

const details = (runtime, providers, extra = {}, region = 'AU') => ({
  runtime,
  genres: [{ id: DRAMA }],
  release_date: '2015-06-01',
  vote_average: 7.2,
  original_language: 'en',
  'watch/providers': { results: { [region]: { flatrate: providers.map(id => ({ provider_id: id, provider_name: `p${id}`, logo_path: null })) } } },
  ...extra,
});

const opts = (over = {}) => ({ ...defaultPickerOptions({ hasServices: true }), ...over });

test('pickerProviderIds keeps numeric ids and drops name-only entries', () => {
  assert.deepEqual(pickerProviderIds([{ id: 8, name: 'Netflix' }, { name: 'Stan' }, { id: '21' }, { id: 8 }]), [8, 21]);
  assert.deepEqual(pickerProviderIds(null), []);
});

test('regionFlatrate reads only the viewer region', () => {
  const d = details(100, [NETFLIX], {}, 'US');
  assert.deepEqual(regionFlatrate(d, 'AU'), []);
  assert.equal(regionFlatrate(d, 'US')[0].id, NETFLIX);
});

test('discoverParams maps every option onto TMDB discover keys', () => {
  const p = discoverParams(opts({ maxRuntime: 90, genreIds: [DRAMA, COMEDY], era: '2010s', minScore: 7, language: 'ko' }), { providerIds: [NETFLIX, STAN], region: 'AU' });
  assert.equal(p['with_runtime.lte'], 90);
  assert.equal(p.with_genres, `${DRAMA}|${COMEDY}`);
  assert.equal(p['primary_release_date.gte'], '2010-01-01');
  assert.equal(p['primary_release_date.lte'], '2019-12-31');
  assert.equal(p['vote_average.gte'], 7);
  assert.ok(p['vote_count.gte'] > 20, 'a score floor asks for more votes');
  assert.equal(p.with_original_language, 'ko');
  assert.equal(p.with_watch_providers, `${NETFLIX}|${STAN}`);
  assert.equal(p.watch_region, 'AU');
});

test('discoverParams leaves providers off when not limited to services', () => {
  const p = discoverParams(opts({ onlyServices: false, maxRuntime: null }), { providerIds: [NETFLIX], region: 'AU' });
  assert.equal(p.with_watch_providers, undefined);
  assert.equal(p['with_runtime.lte'], undefined);
});

test('matchesOptions checks runtime, genre, era, score, language and services', () => {
  const c = { runtime: 95, genre_ids: [DRAMA], release_date: '2015-06-01', vote_average: 7.2, original_language: 'en', providers: [{ id: NETFLIX }] };
  const ids = [NETFLIX];
  assert.equal(matchesOptions(c, opts(), ids), true);
  assert.equal(matchesOptions(c, opts({ maxRuntime: 90 }), ids), false);
  assert.equal(matchesOptions(c, opts({ genreIds: [COMEDY] }), ids), false);
  assert.equal(matchesOptions(c, opts({ genreIds: [COMEDY, DRAMA] }), ids), true, 'any of the genres');
  assert.equal(matchesOptions(c, opts({ era: '1990s' }), ids), false);
  assert.equal(matchesOptions(c, opts({ minScore: 8 }), ids), false);
  assert.equal(matchesOptions(c, opts({ language: 'fr' }), ids), false);
  assert.equal(matchesOptions(c, opts(), [STAN]), false);
  assert.equal(matchesOptions(c, opts({ onlyServices: false }), [STAN]), true);
  assert.equal(matchesOptions({ ...c, runtime: 20 }, opts(), ids), false, 'shorts are not a movie for tonight');
  assert.equal(matchesOptions({ ...c, runtime: null }, opts(), ids), false);
});

test('drawFromPool prefers titles not shown yet', () => {
  const pool = [{ id: 1 }, { id: 2 }, { id: 3 }, { id: 4 }];
  const picked = drawFromPool(pool, 2, { seen: new Set([1, 2]) });
  assert.deepEqual(picked.map(c => c.id).sort(), [3, 4]);
  assert.equal(drawFromPool(pool, 3, { seen: new Set([1, 2, 3]) }).length, 3, 'tops up from seen titles');
  assert.deepEqual(drawFromPool([], 3), []);
});

test('loadWatchlistPool filters live and stops once the target is met', async () => {
  _resetPickerCache();
  let calls = 0;
  const client = {
    async getMovieDetails(id) {
      calls += 1;
      if (id === 102) return details(170, [NETFLIX]);
      if (id === 103) return details(90, [STAN]);
      return details(95, [NETFLIX]);
    },
  };
  const watchlistItems = [
    { tmdb_id: 101, media_type: 'movie', title: 'Fits' },
    { tmdb_id: 102, media_type: 'movie', title: 'Too long' },
    { tmdb_id: 103, media_type: 'movie', title: 'Wrong service' },
    { tmdb_id: 104, media_type: 'tv', title: 'A show' },
    ...Array.from({ length: 30 }, (_, i) => ({ tmdb_id: 500 + i, media_type: 'movie', title: `t${i}` })),
  ];
  const { pool } = await loadWatchlistPool({ watchlistItems, options: opts(), providerIds: [NETFLIX], region: 'AU', client, gapMs: 0, target: 4 });
  assert.ok(pool.length >= 4);
  assert.ok(!pool.some(c => c.id === 102 || c.id === 103));
  assert.ok(pool.every(c => c.onWatchlist));
  assert.ok(calls <= 9, `walked ${calls} of 33`);

  calls = 0;
  await loadWatchlistPool({ watchlistItems, options: opts({ maxRuntime: 150 }), providerIds: [NETFLIX], region: 'AU', client, gapMs: 0, target: 4 });
  assert.equal(calls, 0, 'second walk is served from the session cache');
});

test('loadDiscoverPage drops watched and posterless titles and tags saved ones', async () => {
  const seen = [];
  const client = {
    async discoverMovies(params) {
      seen.push(params);
      return { total_pages: 7, results: [
        { id: 201, title: 'New', poster_path: '/b.jpg' },
        { id: 202, title: 'Watched', poster_path: '/c.jpg' },
        { id: 203, title: 'No poster' },
        { id: 204, title: 'Saved', poster_path: '/d.jpg' },
      ] };
    },
  };
  const { pool, totalPages } = await loadDiscoverPage({
    options: opts(), providerIds: [NETFLIX], region: 'AU', page: 2,
    excludeIds: new Set([202]), savedIds: new Set([204]), client,
  });
  assert.deepEqual(pool.map(c => c.id), [201, 204]);
  assert.equal(pool[1].onWatchlist, true);
  assert.equal(totalPages, 7);
  assert.equal(seen[0].page, 2);
});

const FAMILY = 10751;
const KIDS_TV = 10762;
const NEWS = 10763;

test('discoverParams leaves out kids and family genres when hidden', () => {
  const p = discoverParams(opts({ hideKids: true }), { providerIds: [NETFLIX], region: 'AU' });
  assert.ok(String(p.without_genres).split(',').includes(String(FAMILY)));
  const q = discoverParams(opts({ hideKids: false }), { providerIds: [NETFLIX], region: 'AU' });
  assert.equal(q.without_genres, undefined);
});

test('discoverParams builds TV filters: type, first air date, episode length', () => {
  const p = discoverParams(opts({ mediaType: 'tv', tvFormat: 'miniseries', maxEpisodeRuntime: 45, era: '2010s' }), { providerIds: [NETFLIX], region: 'AU' });
  assert.equal(p.with_type, '2');
  assert.equal(p['with_runtime.lte'], 45);
  assert.equal(p['first_air_date.gte'], '2010-01-01');
  assert.equal(p['primary_release_date.gte'], undefined);
  const without = String(p.without_genres).split(',');
  assert.ok(without.includes(String(NEWS)), 'news is never tonight');
  assert.ok(without.includes(String(KIDS_TV)));
  assert.equal(discoverParams(opts({ mediaType: 'tv' }), { providerIds: [], region: 'AU' }).with_type, '0|2|4');
});

test('pickerGenres uses the type catalog and drops kids genres when hidden', () => {
  const catalog = { movie: [{ id: DRAMA, name: 'Drama' }, { id: FAMILY, name: 'Family' }], tv: [{ id: KIDS_TV, name: 'Kids' }, { id: NEWS, name: 'News' }, { id: DRAMA, name: 'Drama' }] };
  assert.deepEqual(pickerGenres(catalog, opts({ hideKids: true })).map(g => g.id), [DRAMA]);
  assert.deepEqual(pickerGenres(catalog, opts({ hideKids: false })).map(g => g.id), [DRAMA, FAMILY]);
  assert.deepEqual(pickerGenres(catalog, opts({ mediaType: 'tv', hideKids: true })).map(g => g.id), [DRAMA]);
});

test('matchesOptions filters TV by format and episode length', () => {
  const show = { runtime: 50, seasons: 1, miniseries: false, genre_ids: [DRAMA], release_date: '2018-01-01', vote_average: 8, providers: [{ id: NETFLIX }] };
  const tv = (over) => opts({ mediaType: 'tv', ...over });
  assert.equal(matchesOptions(show, tv({ tvFormat: 'oneSeason' }), [NETFLIX]), true);
  assert.equal(matchesOptions(show, tv({ tvFormat: 'multiSeason' }), [NETFLIX]), false);
  assert.equal(matchesOptions(show, tv({ tvFormat: 'miniseries' }), [NETFLIX]), false);
  assert.equal(matchesOptions({ ...show, miniseries: true }, tv({ tvFormat: 'miniseries' }), [NETFLIX]), true);
  assert.equal(matchesOptions(show, tv({ maxEpisodeRuntime: 30 }), [NETFLIX]), false);
  assert.equal(matchesOptions({ ...show, genre_ids: [KIDS_TV] }, tv({}), [NETFLIX]), false, 'kids hidden by default');
});

test('loadDiscoverPage checks season count for season formats only', async () => {
  _resetPickerCache();
  let detailCalls = 0;
  const client = {
    async discoverTV() {
      return { total_pages: 1, results: [
        { id: 301, name: 'One', poster_path: '/a.jpg' },
        { id: 302, name: 'Many', poster_path: '/b.jpg' },
      ] };
    },
    async getTVDetails(id) {
      detailCalls += 1;
      return { number_of_seasons: id === 301 ? 1 : 4, episode_run_time: [42], genres: [{ id: DRAMA }], first_air_date: '2019-01-01', type: 'Scripted' };
    },
  };
  const one = await loadDiscoverPage({ options: opts({ mediaType: 'tv', tvFormat: 'oneSeason' }), providerIds: [NETFLIX], region: 'AU', client, gapMs: 0 });
  assert.deepEqual(one.pool.map(c => c.id), [301]);
  assert.equal(one.pool[0].seasons, 1);
  assert.equal(one.pool[0].runtime, 42);

  detailCalls = 0;
  const any = await loadDiscoverPage({ options: opts({ mediaType: 'tv', tvFormat: 'any' }), providerIds: [NETFLIX], region: 'AU', client, gapMs: 0 });
  assert.equal(any.pool.length, 2);
  assert.equal(detailCalls, 0, 'no details calls when TMDB can filter it');
});
