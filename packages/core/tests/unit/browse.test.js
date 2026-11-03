import assert from 'node:assert/strict';
import test from 'node:test';

import {
  browseTapProps, discoverByKeyword, genreBrowseParams, keywordBrowseParams,
  parseGenreBrowse, parseKeywordBrowse, topKeywords, typeFiltersFor,
} from '../../browse.js';

const q = (obj) => new URLSearchParams(obj);

test('topKeywords reads the movie and TV shapes and caps the list', () => {
  const many = Array.from({ length: 12 }, (_, i) => ({ id: i + 1, name: `k${i + 1}` }));
  assert.equal(topKeywords({ keywords: { keywords: many } }, 'movie').length, 8);
  assert.equal(topKeywords({ keywords: { results: many } }, 'tv', 3).length, 3);
  assert.deepEqual(topKeywords({ keywords: { results: many } }, 'movie'), []);
  assert.deepEqual(topKeywords(null, 'tv'), []);
  assert.deepEqual(topKeywords({ keywords: { keywords: [{ id: 'x', name: 'bad' }, { id: 4 }] } }, 'movie'), []);
});

test('a genre link round-trips into Discover filters', () => {
  const link = genreBrowseParams({ mediaType: 'tv', genreId: 18 });
  assert.deepEqual(parseGenreBrowse(q(link)), { typeFilters: ['tv'], genreFilters: [18] });
  assert.deepEqual(typeFiltersFor('movie'), ['movie', 'cinema']);
});

test('malformed genre links fall back to no filters', () => {
  for (const bad of [{}, { type: 'tv' }, { type: 'person', genre: '18' }, { type: 'tv', genre: 'abc' }, { type: 'tv', genre: '-2' }]) {
    assert.deepEqual(parseGenreBrowse(q(bad)), { typeFilters: null, genreFilters: null });
  }
});

test('a keyword link round-trips and rejects bad input', () => {
  const link = keywordBrowseParams({ mediaType: 'movie', keywordId: 9715, name: 'superhero' });
  assert.deepEqual(parseKeywordBrowse(q(link)), { mediaType: 'movie', keywordId: 9715, name: 'superhero' });
  assert.equal(parseKeywordBrowse(q({ type: 'movie' })), null);
  assert.equal(parseKeywordBrowse(q({ type: 'tv', keyword: '1.5' })), null);
});

test('browseTapProps uses snake_case keys', () => {
  assert.deepEqual(browseTapProps({ kind: 'genre', id: 18, name: 'Drama', mediaType: 'tv', source: 'title_panel' }),
    { kind: 'genre', id: 18, name: 'Drama', media_type: 'tv', source: 'title_panel' });
});

test('discoverByKeyword asks TMDB for the keyword and tags media_type', async () => {
  let seen;
  const client = {
    discoverMovies: async (p) => { seen = p; return { results: [{ id: 1 }] }; },
    discoverTV: async () => { throw new Error('wrong endpoint'); },
  };
  assert.deepEqual(await discoverByKeyword('movie', 77, client), [{ id: 1, media_type: 'movie' }]);
  assert.equal(seen.with_keywords, 77);
  assert.equal(await discoverByKeyword('tv', 5, { discoverTV: async () => null }), null);
});
