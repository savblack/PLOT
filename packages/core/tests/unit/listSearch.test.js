import test from 'node:test';
import assert from 'node:assert/strict';
import { isTopListRank, searchCollectionTitles, TOP_LIST_SIZE } from '../../listCollections.js';
import { filterByTypeAndGenre } from '../../mediaFilters.js';

// Symbolic identifiers are local fixtures, never TMDB lookup IDs.
const film = { tmdb_id: 'fixture-film', media_type: 'movie', title: 'The Quiet Night', genre_ids: [18] };
const series = { tmdb_id: 'fixture-film', media_type: 'tv', name: 'Quiet Days', genre_ids: [35] };

test('personal ranked lists accept only ranks 1 through 5', () => {
  assert.equal(TOP_LIST_SIZE, 5);
  assert.equal(isTopListRank(1), true);
  assert.equal(isTopListRank(5), true);
  assert.equal(isTopListRank(0), false);
  assert.equal(isTopListRank(6), false);
  assert.equal(isTopListRank(2.5), false);
});

test('search trims and ignores case, finds names and titles across collections', () => {
  assert.deepEqual(searchCollectionTitles([[film], [series]], ' QUIET '), [film, series]);
  assert.deepEqual(searchCollectionTitles([[film], [series]], 'missing'), []);
});

test('search deduplicates collection copies but keeps different media types', () => {
  assert.deepEqual(searchCollectionTitles([[film], [{ ...film, id: 'history-row' }, series]], 'quiet'), [film, series]);
});

test('search combines with type and genre filters', () => {
  const collections = [[film, series]].map(items => filterByTypeAndGenre(items, ['movie'], [18]));
  assert.deepEqual(searchCollectionTitles(collections, 'quiet'), [film]);
  assert.deepEqual(searchCollectionTitles(collections, 'days'), []);
});

test('empty collections and missing titles are safe', () => {
  assert.deepEqual(searchCollectionTitles([[], [{ tmdb_id: 'untitled' }]], 'quiet'), []);
});
