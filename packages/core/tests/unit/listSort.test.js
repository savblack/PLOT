import test from 'node:test';
import assert from 'node:assert/strict';
import { sortListItems } from '../../listCollections.js';

test('sortListItems preserves list order by default', () => {
  const items = [{ title: 'Zulu' }, { name: 'Alpha' }];
  assert.equal(sortListItems(items, 'list'), items);
});

test('sortListItems sorts titles in either direction without mutating the source', () => {
  const items = [{ title: 'Zulu' }, { name: 'Alpha' }, { title: 'Moon' }];

  assert.deepEqual(sortListItems(items, 'title-asc').map(item => item.title || item.name), ['Alpha', 'Moon', 'Zulu']);
  assert.deepEqual(sortListItems(items, 'title-desc').map(item => item.title || item.name), ['Zulu', 'Moon', 'Alpha']);
  assert.deepEqual(items.map(item => item.title || item.name), ['Zulu', 'Alpha', 'Moon']);
});
