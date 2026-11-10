import assert from 'node:assert/strict';
import test from 'node:test';
import { normalizeTitle, clearTitleMatch } from '@plot/core/searchMatch.js';

// Shapes only: these ids are placeholders in a pure function's input, never
// sent to TMDB or used to look anything up.
const movie = (id, title) => ({ id, media_type: 'movie', title });
const show = (id, name) => ({ id, media_type: 'tv', name });
const person = (id, name) => ({ id, media_type: 'person', name });

test('normalizeTitle ignores case, accents, punctuation and spacing', () => {
  assert.equal(normalizeTitle('  Amélie! '), 'amelie');
  assert.equal(normalizeTitle('Mr. & Mrs. Smith'), 'mr and mrs smith');
  assert.equal(normalizeTitle('The Bear'), 'the bear');
  assert.notEqual(normalizeTitle('The Bear'), normalizeTitle('Bear'));
});

test('one exact title is a clear match, whatever else the search returned', () => {
  const results = [show(1, 'The Bear'), movie(2, 'The Bear Hunt'), person(3, 'Bear Grylls')];
  assert.deepEqual(clearTitleMatch(results, 'the bear'), { id: 1, media_type: 'tv' });
});

test('two exact titles (a film and a series, a remake) are not a clear match', () => {
  assert.equal(clearTitleMatch([movie(1, 'Shogun'), show(2, 'Shōgun')], 'Shogun'), null);
});

test('no exact title is not a match, even with close ones', () => {
  assert.equal(clearTitleMatch([movie(1, 'The Bear Hunt')], 'The Bear'), null);
});

test('people and malformed results never match', () => {
  assert.equal(clearTitleMatch([person(1, 'Zendaya')], 'Zendaya'), null);
  assert.equal(clearTitleMatch([{ media_type: 'movie', title: 'Heat' }], 'Heat'), null);
  assert.equal(clearTitleMatch(null, 'Heat'), null);
  assert.equal(clearTitleMatch([movie(1, 'Heat')], '   '), null);
});
