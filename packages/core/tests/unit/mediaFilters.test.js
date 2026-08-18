import assert from 'node:assert/strict';
import test from 'node:test';

import { ALL_TYPES, filterByType, filterByGenre } from '../../mediaFilters.js';

const items = [
  { media_type: 'tv', genre_ids: [1] },
  { media_type: 'movie', genre_ids: [2] },
  { media_type: 'movie', _cinema: true, genre_ids: [3] },
];

test('ALL_TYPES lists the three known type filters', () => {
  assert.deepEqual(ALL_TYPES, ['tv', 'cinema', 'movie']);
});

test('filterByType passes through null/undefined items unchanged', () => {
  assert.equal(filterByType(null, ['tv']), null);
  assert.equal(filterByType(undefined, ['tv']), undefined);
});

test('filterByType skips filtering when no type filters are given', () => {
  assert.deepEqual(filterByType(items, []), items);
});

test('filterByType skips filtering when every type is selected', () => {
  assert.deepEqual(filterByType(items, ['tv', 'cinema', 'movie']), items);
});

test('filterByType keeps only tv items when tv is selected', () => {
  assert.deepEqual(filterByType(items, ['tv']), [items[0]]);
});

test('filterByType keeps only cinema-flagged movies when cinema is selected', () => {
  assert.deepEqual(filterByType(items, ['cinema']), [items[2]]);
});

test('filterByType excludes cinema-flagged movies when only movie is selected', () => {
  assert.deepEqual(filterByType(items, ['movie']), [items[1]]);
});

test('filterByType requires _cinema to be strictly true, not just truthy', () => {
  assert.deepEqual(filterByType([{ media_type: 'movie', _cinema: 1 }], ['cinema']), []);
});

test('filterByType drops everything when the filter list matches no branch', () => {
  assert.deepEqual(filterByType(items, ['other']), []);
});

test('BUG-ish: filterByType treats a 3-item filter list as "all types" even with duplicates', () => {
  assert.deepEqual(filterByType(items, ['tv', 'tv', 'tv']), items);
});

test('filterByGenre passes through null/undefined items unchanged', () => {
  assert.equal(filterByGenre(null, [1]), null);
  assert.equal(filterByGenre(undefined, [1]), undefined);
});

test('filterByGenre skips filtering when no genre filters are given', () => {
  assert.deepEqual(filterByGenre(items, []), items);
});

test('filterByGenre keeps items with no genre_ids at all', () => {
  assert.deepEqual(filterByGenre([{ title: 'x' }], [1]), [{ title: 'x' }]);
});

test('filterByGenre keeps items with an empty genre_ids array', () => {
  assert.deepEqual(filterByGenre([{ genre_ids: [] }], [1]), [{ genre_ids: [] }]);
});

test('filterByGenre keeps items whose genre_ids intersect the filter and drops the rest', () => {
  assert.deepEqual(filterByGenre(items, [2]), [items[1]]);
});

test('filterByGenre keeps items matching any of several filter genres', () => {
  assert.deepEqual(filterByGenre(items, [1, 3]), [items[0], items[2]]);
});
