import assert from 'node:assert/strict';
import test from 'node:test';

import { classifySearchResults } from '../../search.js';

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
