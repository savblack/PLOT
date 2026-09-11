import assert from 'node:assert/strict';
import test from 'node:test';

import {
  tmdb,
  setTmdbRegion,
  getTmdbRegion,
  excludeKidsContent,
  isEnglishOriginTitle,
  prioritiseEnglishSpeakingTitles,
  regionalMovieReleaseDate,
  fetchFromTMDBResolved,
} from '../../tmdb.js';
import { configure } from '../../config.js';

// tmdb.js is mostly a thin network wrapper (fetchFromTMDBResolved's retry/backoff
// loop and the `tmdb` object's proxy calls) with no injection seam for fetch —
// see the test summary. Only the pure helpers below, plus the fully-synchronous
// misconfigured-proxy guard, are covered here.

test.afterEach(() => {
  setTmdbRegion('US');
});

test('setTmdbRegion/getTmdbRegion round-trip the module-level region', () => {
  assert.equal(getTmdbRegion(), 'US');
  setTmdbRegion('GB');
  assert.equal(getTmdbRegion(), 'GB');
});

test('excludeKidsContent passes items through unchanged when hideKids is falsy', () => {
  const items = [{ id: 1, genre_ids: [10751] }];
  assert.deepEqual(excludeKidsContent(items, false), items);
  assert.deepEqual(excludeKidsContent(items, undefined), items);
});

test('excludeKidsContent drops items tagged with the Family or Kids genre ids', () => {
  const items = [
    { id: 1, genre_ids: [18] },
    { id: 2, genre_ids: [10751] },
    { id: 3, genre_ids: [10762, 99] },
    { id: 4 },
  ];
  assert.deepEqual(excludeKidsContent(items, true).map(i => i.id), [1, 4]);
});

test('excludeKidsContent defaults to an empty array with no items', () => {
  assert.deepEqual(excludeKidsContent(undefined, true), []);
});

test('isEnglishOriginTitle is true for original_language "en" or an English-speaking origin_country', () => {
  assert.equal(isEnglishOriginTitle({ original_language: 'en' }), true);
  assert.equal(isEnglishOriginTitle({ original_language: 'fr', origin_country: ['US'] }), true);
});

test('isEnglishOriginTitle is false otherwise, including for a missing/empty item', () => {
  assert.equal(isEnglishOriginTitle({ original_language: 'fr', origin_country: ['FR'] }), false);
  assert.equal(isEnglishOriginTitle({}), false);
  assert.equal(isEnglishOriginTitle(null), false);
});

test('prioritiseEnglishSpeakingTitles interleaves 2 preferred titles per 1 other, preserving each group order', () => {
  const items = [
    { id: 'e1', original_language: 'en' },
    { id: 'o1', original_language: 'fr' },
    { id: 'e2', original_language: 'en' },
    { id: 'o2', original_language: 'es' },
    { id: 'e3', original_language: 'en' },
    { id: 'e4', original_language: 'en' },
    { id: 'o3', original_language: 'de' },
  ];
  assert.deepEqual(
    prioritiseEnglishSpeakingTitles(items).map(i => i.id),
    ['e1', 'e2', 'o1', 'e3', 'e4', 'o2', 'o3'],
  );
});

test('prioritiseEnglishSpeakingTitles handles an empty list and an all-other list', () => {
  assert.deepEqual(prioritiseEnglishSpeakingTitles([]), []);
  const onlyOther = [{ id: 'only-other', original_language: 'fr' }];
  assert.deepEqual(prioritiseEnglishSpeakingTitles(onlyOther), onlyOther);
});

test('regionalMovieReleaseDate prefers the release type order over array order, for the requested region', () => {
  const releaseDates = {
    results: [
      { iso_3166_1: 'US', release_dates: [
        { type: 2, release_date: '2020-01-01T00:00:00.000Z' },
        { type: 3, release_date: '2020-02-01T00:00:00.000Z' },
      ] },
      { iso_3166_1: 'GB', release_dates: [{ type: 3, release_date: '2020-03-01T00:00:00.000Z' }] },
    ],
  };
  assert.equal(regionalMovieReleaseDate(releaseDates, 'US'), '2020-02-01', 'type 3 (theatrical) outranks type 2 despite appearing later');
  assert.equal(regionalMovieReleaseDate(releaseDates, 'GB'), '2020-03-01');
});

test('regionalMovieReleaseDate falls back to the first dated entry when no preferred type is present', () => {
  const releaseDates = { results: [{ iso_3166_1: 'US', release_dates: [
    { type: 6, release_date: '2020-05-01T00:00:00.000Z' },
    { type: 1, release_date: '2020-06-01T00:00:00.000Z' },
  ] }] };
  assert.equal(regionalMovieReleaseDate(releaseDates, 'US'), '2020-06-01', 'type 1 outranks type 6 in REGIONAL_RELEASE_TYPE_ORDER');
});

test('regionalMovieReleaseDate returns null for a missing region or missing data', () => {
  const releaseDates = { results: [{ iso_3166_1: 'US', release_dates: [{ type: 3, release_date: '2020-02-01T00:00:00.000Z' }] }] };
  assert.equal(regionalMovieReleaseDate(releaseDates, 'FR'), null);
  assert.equal(regionalMovieReleaseDate(null, 'US'), null);
});

test('regionalMovieReleaseDate defaults to the module-level tmdb region when none is passed', () => {
  const releaseDates = { results: [{ iso_3166_1: 'GB', release_dates: [{ type: 3, release_date: '2020-03-01T00:00:00.000Z' }] }] };
  setTmdbRegion('GB');
  assert.equal(regionalMovieReleaseDate(releaseDates), '2020-03-01');
});

test('fetchFromTMDBResolved returns a terminal, non-retryable error without fetching when tmdbProxyUrl is not configured', async () => {
  configure({ tmdbProxyUrl: '' });
  const originalError = console.error;
  console.error = () => {};
  try {
    const result = await fetchFromTMDBResolved('/movie/1');
    assert.deepEqual(result, { ok: false, data: null, status: null, retryable: false });
  } finally {
    console.error = originalError;
  }
});

/* ── tmdb.searchTitles ──
   Stubs globalThis.fetch at the proxy boundary: these assert which TMDB
   endpoint the parsed intent picks, and how many requests that costs. */

const withStubbedProxy = async (handler, run) => {
  const originalFetch = globalThis.fetch;
  const requests = [];
  configure({ tmdbProxyUrl: 'https://proxy.test', supabaseAnonKey: 'anon' });
  globalThis.fetch = async (url) => {
    const request = new URL(url);
    requests.push(request);
    return { ok: true, status: 200, json: async () => handler(request) };
  };
  try {
    return { result: await run(), requests };
  } finally {
    globalThis.fetch = originalFetch;
  }
};

test('searchTitles sends a "tv series" query to /search/tv, title only', async () => {
  const { result, requests } = await withStubbedProxy(
    (request) => (request.searchParams.get('path') === 'search/tv'
      // "7 Up" is filed on TMDB as "The Up Series", so nothing here matches the
      // query strongly and the raw-query fallback fires — which returns nothing,
      // because "7 up tv series" is not a title. The tv hit has to survive that.
      ? { results: [{ id: 1, name: 'The Up Series', popularity: 5.7 }] }
      : { results: [] }),
    () => tmdb.searchTitles('7 up tv series'),
  );

  assert.deepEqual(requests.map(r => r.searchParams.get('path')), ['search/tv', 'search/multi']);
  assert.equal(requests[0].searchParams.get('query'), '7 up');
  assert.deepEqual(result.results.map(r => r.id), [1]);
  // /search/tv omits media_type; every consumer downstream branches on it.
  assert.deepEqual(result.results.map(r => r.media_type), ['tv']);
});

test('searchTitles sends a "movie" query to /search/movie with the parsed year', async () => {
  const { requests } = await withStubbedProxy(
    () => ({ results: [{ id: 1, title: 'Dune' }] }),
    () => tmdb.searchTitles('dune movie 2021'),
  );

  assert.equal(requests[0].searchParams.get('path'), 'search/movie');
  assert.equal(requests[0].searchParams.get('query'), 'dune');
  assert.equal(requests[0].searchParams.get('primary_release_year'), '2021');
});

test('searchTitles uses /search/multi when the query implies no type', async () => {
  const { requests } = await withStubbedProxy(
    () => ({ results: [{ id: 1, media_type: 'tv', name: 'Severance' }] }),
    () => tmdb.searchTitles('severance'),
  );

  assert.equal(requests.length, 1);
  assert.equal(requests[0].searchParams.get('path'), 'search/multi');
  assert.equal(requests[0].searchParams.get('query'), 'severance');
});

test('searchTitles lets an explicit media type override the query text', async () => {
  const { requests } = await withStubbedProxy(
    () => ({ results: [] }),
    () => tmdb.searchTitles('the office tv show', { mediaType: 'movie' }),
  );

  assert.equal(requests[0].searchParams.get('path'), 'search/movie');
});

test('searchTitles drops a year filter that matched nothing', async () => {
  const { requests } = await withStubbedProxy(
    (request) => (request.searchParams.get('first_air_date_year')
      ? { results: [] }
      : { results: [{ id: 1, name: 'The Bear' }] }),
    () => tmdb.searchTitles('the bear tv series 2019'),
  );

  assert.equal(requests.length, 2);
  assert.equal(requests[1].searchParams.get('first_air_date_year'), null);
  assert.equal(requests[1].searchParams.get('query'), 'the bear');
});

test('searchTitles retries the raw query when the stripped qualifier was the title', async () => {
  const { result, requests } = await withStubbedProxy(
    (request) => (request.searchParams.get('path') === 'search/tv'
      ? { results: [{ id: 9, name: 'Glass House', popularity: 0.4 }] }
      : { results: [{ id: 3, media_type: 'movie', title: 'The Truman Show', popularity: 0.3 }] }),
    () => tmdb.searchTitles('the truman show'),
  );

  assert.deepEqual(requests.map(r => r.searchParams.get('path')), ['search/tv', 'search/multi']);
  assert.equal(requests[1].searchParams.get('query'), 'the truman show');
  // Both result sets are kept; ranking decides, and the exact match wins.
  assert.deepEqual(result.results.map(r => r.id), [3, 9]);
});

test('searchTitles costs one request when the first search already answered it', async () => {
  const { requests } = await withStubbedProxy(
    () => ({ results: [{ id: 1, name: 'The Office', popularity: 156 }] }),
    () => tmdb.searchTitles('the office tv show'),
  );

  assert.equal(requests.length, 1);
});

test('searchTitles makes no request for an empty query', async () => {
  const { result, requests } = await withStubbedProxy(
    () => ({ results: [] }),
    () => tmdb.searchTitles('   '),
  );

  assert.equal(requests.length, 0);
  assert.deepEqual(result.results, []);
});

test('searchTitles widens to /search/multi when a type-scoped search finds nothing', async () => {
  // Also the degradation path if the tmdb-proxy allowlist has not yet shipped
  // /search/{movie,tv}: a 403 reads as no results, and multi still answers.
  const { result, requests } = await withStubbedProxy(
    (request) => (request.searchParams.get('path') === 'search/multi'
      ? { results: [{ id: 7, media_type: 'movie', title: 'Inception' }] }
      : { results: [] }),
    () => tmdb.searchTitles('inception', { mediaType: 'movie' }),
  );

  assert.deepEqual(requests.map(r => r.searchParams.get('path')), ['search/movie', 'search/multi']);
  assert.equal(requests[1].searchParams.get('query'), 'inception');
  assert.deepEqual(result.results.map(r => r.id), [7]);
});

test('searchTitles does not repeat an identical /search/multi query that found nothing', async () => {
  const { requests } = await withStubbedProxy(
    () => ({ results: [] }),
    () => tmdb.searchTitles('zzzqqxnothing'),
  );

  assert.equal(requests.length, 1);
});
