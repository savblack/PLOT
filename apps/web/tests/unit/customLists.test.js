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
