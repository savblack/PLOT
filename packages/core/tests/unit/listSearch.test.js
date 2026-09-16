import test from 'node:test';
import assert from 'node:assert/strict';
import { searchCollectionTitles } from '../../listCollections.js';
import { filterByTypeAndGenre } from '../../mediaFilters.js';

// Symbolic identifiers are local fixtures, never TMDB lookup IDs.
const film = { tmdb_id: 'fixture-film', media_type: 'movie', title: 'The Quiet Night', genre_ids: [18] };
const series = { tmdb_id: 'fixture-film', media_type: 'tv', name: 'Quiet Days', genre_ids: [35] };

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
