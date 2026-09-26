import assert from 'node:assert/strict';
import test from 'node:test';
import {
  buildGenreRailDefinitions,
  loadNewReleaseData,
  prepareNewReleaseGenreRails,
  tagCinemaReleases,
} from '../../useNewReleases.js';

const rails = [
  { key: 'horror', label: 'New in Horror', genreIds: [27], items: [{ id: 1, media_type: 'movie', genre_ids: [27] }] },
  { key: 'comedy', label: 'New in Comedy', genreIds: [35], items: [{ id: 2, media_type: 'tv', genre_ids: [35] }] },
  { key: 'action', label: 'New in Action', genreIds: [28], items: [{ id: 3, media_type: 'movie', genre_ids: [28] }] },
  { key: 'truecrime', label: 'New in True Crime', genreIds: [], items: [{ id: 4, media_type: 'tv', genre_ids: [] }] },
];

test('buildGenreRailDefinitions covers movie and TV catalogs while keeping distinct names separate', () => {
  const definitions = buildGenreRailDefinitions({
    movie: [{ id: 28, name: 'Action' }, { id: 35, name: 'Comedy' }],
    tv: [{ id: 10759, name: 'Action & Adventure' }, { id: 35, name: 'Comedy' }],
  });

  assert.deepEqual(definitions.map(rail => rail.label), [
    'New in Action',
    'New in Action & Adventure',
    'New in Comedy',
  ]);
  assert.deepEqual(definitions.find(rail => rail.key === 'comedy').genreIds, [35]);
});

test('prepareNewReleaseGenreRails removes the repeated prefix and sorts by genre', () => {
  const prepared = prepareNewReleaseGenreRails(rails, ['tv', 'cinema', 'movie'], []);
  assert.deepEqual(prepared.map(rail => rail.title), ['Action', 'Comedy', 'Horror', 'True Crime']);
});

test('prepareNewReleaseGenreRails removes deselected genre rails from the page index and stream', () => {
  const prepared = prepareNewReleaseGenreRails(rails, ['tv', 'cinema', 'movie'], [28, 35]);
  assert.deepEqual(prepared.map(rail => rail.key), ['action', 'comedy']);
});

test('prepareNewReleaseGenreRails removes rails emptied by the type filter', () => {
  const prepared = prepareNewReleaseGenreRails(rails, ['tv'], []);
  assert.deepEqual(prepared.map(rail => rail.key), ['comedy', 'truecrime']);
});

test('tagCinemaReleases makes regional now-playing movies available to the cinema filter', () => {
  const tagged = tagCinemaReleases(rails, [{ id: 3 }]);
  const prepared = prepareNewReleaseGenreRails(tagged, ['cinema'], []);

  assert.deepEqual(prepared.map(rail => rail.key), ['action']);
  assert.equal(prepared[0].items[0]._cinema, true);
});

test('recent-only loading skips the per-genre catalogue Home does not render', async () => {
  const calls = [];
  const client = {
    async getRecentReleases() {
      calls.push('recent');
      return {
        movies: [{ id: 1, media_type: 'movie', title: 'Recent', release_date: '2026-09-20', original_language: 'en', poster_path: '/recent.jpg' }],
        tv: [],
      };
    },
    async getGenreCatalog() { calls.push('genres'); throw new Error('should not load genres'); },
    async getNowPlaying() { calls.push('cinema'); throw new Error('should not load cinema'); },
    async discoverNewestByGenre() { calls.push('genre rail'); throw new Error('should not load genre rails'); },
  };

  const data = await loadNewReleaseData({ includeGenreRails: false, client });

  assert.deepEqual(calls, ['recent']);
  assert.deepEqual(data.genreRails, []);
  assert.deepEqual(data.recent.map(item => item.id), [1]);
});
