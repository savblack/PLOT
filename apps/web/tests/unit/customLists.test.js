import test from 'node:test';
import assert from 'node:assert/strict';

import { normalizeCustomListName, findDuplicateCustomList } from '@plot/core/customLists.js';

test('normalizeCustomListName trims, collapses whitespace, and lowercases', () => {
  assert.equal(normalizeCustomListName('  Friday   Movies  '), 'friday movies');
});

test('findDuplicateCustomList matches names case-insensitively', () => {
  const lists = [
    { id: '1', name: 'Weekend Watch' },
    { id: '2', name: 'Comfort TV' },
  ];

  assert.deepEqual(findDuplicateCustomList(lists, ' weekend   watch '), lists[0]);
});

test('findDuplicateCustomList can exclude the current list id', () => {
  const lists = [
    { id: '1', name: 'Weekend Watch' },
    { id: '2', name: 'Comfort TV' },
  ];

  assert.equal(findDuplicateCustomList(lists, 'Weekend Watch', '1'), null);
});

test('custom list rows filter by type and genre like Favourites', async () => {
  const { filterByTypeAndGenre } = await import('@plot/core/mediaFilters.js');
  // Shaped like custom_list_items rows. Filtering never reads tmdb_id, so none is set.
  const rows = [
    { id: 'row-1', media_type: 'tv',    genre_ids: [1] },
    { id: 'row-2', media_type: 'movie', genre_ids: [2] },
    { id: 'row-3', media_type: 'movie', genre_ids: [] },
  ];

  assert.deepEqual(filterByTypeAndGenre(rows, ['tv'], []).map(r => r.id), ['row-1']);
  assert.deepEqual(filterByTypeAndGenre(rows, ['tv', 'movie', 'cinema'], [2]).map(r => r.id), ['row-2', 'row-3']);
  assert.deepEqual(filterByTypeAndGenre(undefined, ['tv'], []), []);
  // List pages offer TV and Movies only (no Cinema row), so that pair is "everything".
  assert.deepEqual(filterByTypeAndGenre(rows, ['tv', 'movie'], []).map(r => r.id), ['row-1', 'row-2', 'row-3']);
});
