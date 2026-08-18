import assert from 'node:assert/strict';
import test from 'node:test';

import {
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
