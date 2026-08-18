import assert from 'node:assert/strict';
import test from 'node:test';

import {
  normalizeMediaType,
  mediaTypeFromItem,
  tmdbIdFromItem,
  titleFromItem,
  posterPathFromItem,
  releaseDateFromItem,
  genreIdsFromItem,
  providerIdsForRegion,
  baseMediaRow,
  mediaIdentityRow,
} from '../../media.js';

test('normalizeMediaType maps show/series aliases to tv and passes movie/tv through', () => {
  assert.equal(normalizeMediaType('show'), 'tv');
  assert.equal(normalizeMediaType('series'), 'tv');
  assert.equal(normalizeMediaType('movie'), 'movie');
  assert.equal(normalizeMediaType('tv'), 'tv');
});

test('normalizeMediaType returns null for anything else', () => {
  assert.equal(normalizeMediaType('person'), null);
  assert.equal(normalizeMediaType(''), null);
  assert.equal(normalizeMediaType(null), null);
  assert.equal(normalizeMediaType(undefined), null);
});

test('mediaTypeFromItem reads media_type first, falling back to type', () => {
  assert.equal(mediaTypeFromItem({ media_type: 'tv' }), 'tv');
  assert.equal(mediaTypeFromItem({ type: 'series' }), 'tv');
});

test('mediaTypeFromItem falls back to the fallback param when the type is unrecognized', () => {
  assert.equal(mediaTypeFromItem({ media_type: 'person' }), 'movie');
  assert.equal(mediaTypeFromItem({ media_type: 'person' }, 'tv'), 'tv');
  assert.equal(mediaTypeFromItem(null), 'movie');
  assert.equal(mediaTypeFromItem(undefined, 'tv'), 'tv');
});

test('tmdbIdFromItem reads id first, falling back to tmdb_id', () => {
  assert.equal(tmdbIdFromItem({ id: 123 }), 123);
  assert.equal(tmdbIdFromItem({ tmdb_id: 456 }), 456);
  assert.equal(tmdbIdFromItem({ id: null, tmdb_id: 5 }), 5);
});

test('tmdbIdFromItem coerces numeric strings and rejects non-numeric values', () => {
  assert.equal(tmdbIdFromItem({ id: '789' }), 789);
  assert.equal(tmdbIdFromItem({ id: 'abc' }), null);
  assert.equal(tmdbIdFromItem(null), null);
});

test('tmdbIdFromItem treats id 0 as present, not nullish, so it does not fall back to tmdb_id', () => {
  assert.equal(tmdbIdFromItem({ id: 0, tmdb_id: 5 }), 0);
});

test('titleFromItem prefers title over name and falls back when title is empty', () => {
  assert.equal(titleFromItem({ title: 'Movie A', name: 'Ignored' }), 'Movie A');
  assert.equal(titleFromItem({ name: 'Show B' }), 'Show B');
  assert.equal(titleFromItem({ title: '', name: 'Fallback' }), 'Fallback');
  assert.equal(titleFromItem({}), '');
  assert.equal(titleFromItem(null), '');
});

test('posterPathFromItem returns the path or null', () => {
  assert.equal(posterPathFromItem({ poster_path: '/x.jpg' }), '/x.jpg');
  assert.equal(posterPathFromItem({}), null);
  assert.equal(posterPathFromItem({ poster_path: '' }), null);
  assert.equal(posterPathFromItem(null), null);
});

test('releaseDateFromItem prefers release_date over first_air_date', () => {
  assert.equal(releaseDateFromItem({ release_date: '2020-01-01' }), '2020-01-01');
  assert.equal(releaseDateFromItem({ first_air_date: '2021-01-01' }), '2021-01-01');
  assert.equal(releaseDateFromItem({}), null);
  assert.equal(releaseDateFromItem({ release_date: '', first_air_date: '2022-02-02' }), '2022-02-02');
});

test('genreIdsFromItem reads genre_ids directly and filters to integers', () => {
  assert.deepEqual(genreIdsFromItem({ genre_ids: [18, 80, 'x', null, 3.5] }), [18, 80]);
});

test('genreIdsFromItem falls back to the genres shape, accepting bare numbers or {id} objects', () => {
  assert.deepEqual(genreIdsFromItem({ genres: [{ id: 18, name: 'Drama' }, { id: 80 }] }), [18, 80]);
  assert.deepEqual(genreIdsFromItem({ genres: [18, 80] }), [18, 80]);
  assert.deepEqual(genreIdsFromItem({ genres: [{ id: null }, { name: 'NoId' }] }), []);
});

test('genreIdsFromItem prefers an empty genre_ids array over a populated genres array', () => {
  assert.deepEqual(genreIdsFromItem({ genre_ids: [], genres: [{ id: 18 }] }), []);
});

test('genreIdsFromItem returns an empty array when neither shape is present', () => {
  assert.deepEqual(genreIdsFromItem({}), []);
  assert.deepEqual(genreIdsFromItem(null), []);
});

test('providerIdsForRegion reads flatrate provider ids for the given region', () => {
  const item = { 'watch/providers': { results: { US: { flatrate: [{ provider_id: 8 }, { provider_id: 9 }] } } } };
  assert.deepEqual(providerIdsForRegion(item, 'US'), [8, 9]);
});

test('providerIdsForRegion drops falsy provider ids and returns empty for a missing region', () => {
  const item = { 'watch/providers': { results: { US: { flatrate: [{ provider_id: 0 }, {}] } } } };
  assert.deepEqual(providerIdsForRegion(item, 'US'), []);
  assert.deepEqual(providerIdsForRegion(item, 'GB'), []);
});

test('providerIdsForRegion returns an empty array for items missing the providers shape', () => {
  assert.deepEqual(providerIdsForRegion({}, 'US'), []);
  assert.deepEqual(providerIdsForRegion(null, 'US'), []);
});

test('baseMediaRow builds a normalized row from a TMDB-shaped item', () => {
  const item = { id: 1, title: 'A', media_type: 'movie', poster_path: '/p.jpg', release_date: '2020-01-01' };
  assert.deepEqual(baseMediaRow(item), {
    tmdb_id: 1,
    media_type: 'movie',
    title: 'A',
    poster_path: '/p.jpg',
    release_date: '2020-01-01',
  });
});

test('baseMediaRow returns null when the item has no usable id', () => {
  assert.equal(baseMediaRow({ name: 'B' }), null);
});

test('baseMediaRow returns null for an id of 0, even though tmdbIdFromItem treats 0 as valid', () => {
  assert.equal(baseMediaRow({ id: 0, title: 'Zero' }), null);
});

test('baseMediaRow passes the fallbackType option through to mediaTypeFromItem', () => {
  const row = baseMediaRow({ id: 2, name: 'Show' }, { fallbackType: 'tv' });
  assert.equal(row.media_type, 'tv');
});

test('mediaIdentityRow strips release_date from baseMediaRow', () => {
  const item = { id: 1, title: 'A', media_type: 'movie', poster_path: '/p.jpg', release_date: '2020-01-01' };
  assert.deepEqual(mediaIdentityRow(item), {
    tmdb_id: 1,
    media_type: 'movie',
    title: 'A',
    poster_path: '/p.jpg',
  });
});

test('mediaIdentityRow returns null when baseMediaRow would return null', () => {
  assert.equal(mediaIdentityRow({ name: 'B' }), null);
});
