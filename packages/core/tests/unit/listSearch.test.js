import test from 'node:test';
import assert from 'node:assert/strict';
import { isTopListRank, myListsSearchSources, searchCollectionTitles, TOP_LIST_SIZE } from '../../listCollections.js';
import { filterByType, filterByTypeAndGenre } from '../../mediaFilters.js';

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

test('My Lists search sources type watching and Top 5, and drop ranks past 5', () => {
  const watching = { tmdb_id: 'fixture-show', title: 'Quiet Days' };
  const movie = { tmdb_id: 'fixture-film', title: 'The Quiet Night', rank: 5 };
  const past = { tmdb_id: 'fixture-extra', title: 'Quiet Extra', rank: 6 };
  const sources = myListsSearchSources({
    watching: [watching],
    topMovies: [movie, past],
    topTv: [{ tmdb_id: 'fixture-film', name: 'Quiet Days', rank: 1 }],
    collections: [[{ tmdb_id: 'fixture-film', media_type: 'movie', title: 'The Quiet Night' }]],
  });
  const found = searchCollectionTitles(sources, 'quiet');
  assert.deepEqual(found.map(item => `${item.media_type}:${item.tmdb_id}`), [
    'tv:fixture-show',
    'movie:fixture-film',
    'tv:fixture-film',
  ]);
  const moviesOnly = searchCollectionTitles(sources.map(items => filterByType(items, ['movie'])), 'quiet');
  assert.deepEqual(moviesOnly.map(item => item.tmdb_id), ['fixture-film']);
});

