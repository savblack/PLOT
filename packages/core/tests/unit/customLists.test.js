import assert from 'node:assert/strict';
import test from 'node:test';

import { normalizeCustomListName, findDuplicateCustomList } from '../../customLists.js';

test('normalizeCustomListName trims, collapses internal whitespace, and lowercases', () => {
  assert.equal(normalizeCustomListName('My   Cool  List'), 'my cool list');
  assert.equal(normalizeCustomListName('  Leading and trailing  '), 'leading and trailing');
  assert.equal(normalizeCustomListName('A\n\tB'), 'a b');
});

test('normalizeCustomListName returns an empty string for nullish or falsy input', () => {
  assert.equal(normalizeCustomListName(null), '');
  assert.equal(normalizeCustomListName(undefined), '');
  assert.equal(normalizeCustomListName(0), '');
});

test('findDuplicateCustomList returns null immediately when the candidate name normalizes to empty', () => {
  const lists = [{ id: 'a', name: 'Comfort Watches' }];
  assert.equal(findDuplicateCustomList(lists, '   '), null);
  assert.equal(findDuplicateCustomList(lists, ''), null);
});

test('findDuplicateCustomList returns null for a missing lists array', () => {
  assert.equal(findDuplicateCustomList(null, 'Comfort Watches'), null);
  assert.equal(findDuplicateCustomList(undefined, 'Comfort Watches'), null);
});

test('findDuplicateCustomList matches case- and whitespace-insensitively', () => {
  const lists = [{ id: 'a', name: 'Comfort Watches' }, { id: 'c', name: 'Horror' }];
  assert.deepEqual(findDuplicateCustomList(lists, '  comfort   watches '), { id: 'a', name: 'Comfort Watches' });
});

test('findDuplicateCustomList returns null when no list matches', () => {
  const lists = [{ id: 'a', name: 'Comfort Watches' }];
  assert.equal(findDuplicateCustomList(lists, 'Nonexistent'), null);
});

test('findDuplicateCustomList excludes only the given id, not other duplicates', () => {
  const lists = [
    { id: 'a', name: 'Comfort Watches' },
    { id: 'b', name: '  comfort   watches ' },
  ];
  assert.deepEqual(findDuplicateCustomList(lists, 'Comfort Watches', 'a'), { id: 'b', name: '  comfort   watches ' });
  assert.equal(findDuplicateCustomList([lists[0]], 'Comfort Watches', 'a'), null);
});
