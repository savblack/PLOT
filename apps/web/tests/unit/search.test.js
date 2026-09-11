import assert from 'node:assert/strict';
import test from 'node:test';
import { classifySearchResults, parseSearchQuery, rankSearchResults } from '../../src/utils/search.js';

test('classifySearchResults keeps playable movie and tv results', () => {
  const result = classifySearchResults([
    { id: 1, media_type: 'movie', title: 'Inception', poster_path: '/x.jpg' },
    { id: 2, media_type: 'person', name: 'Christopher Nolan' },
  ]);

  assert.equal(result.emptyMode, 'none');
  assert.deepEqual(result.filtered.map(item => item.id), [1]);
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

test('parseSearchQuery reads type and year intent out of a typed query', () => {
  assert.deepEqual(parseSearchQuery('7 up tv series'), {
    title: '7 up', mediaType: 'tv', year: null, rawQuery: '7 up tv series',
  });
  assert.deepEqual(parseSearchQuery('the bear 2022'), {
    title: 'the bear', mediaType: null, year: 2022, rawQuery: 'the bear 2022',
  });
});

test('rankSearchResults puts the exact title above a more popular near-miss', () => {
  const ranked = rankSearchResults([
    { id: 1, media_type: 'tv', name: 'The Office Movers', popularity: 500 },
    { id: 2, media_type: 'tv', name: 'The Office', popularity: 9 },
  ], { title: 'the office', rawQuery: 'the office tv show', mediaType: 'tv' });

  assert.deepEqual(ranked.map(r => r.id), [2, 1]);
});
