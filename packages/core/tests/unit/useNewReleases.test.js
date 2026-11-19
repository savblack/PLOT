import assert from 'node:assert/strict';
import test from 'node:test';
import {
  buildGenreRailDefinitions,
  loadNewReleaseData,
  prepareNewReleaseGenreRails,
  tagCinemaReleases,
} from '../../useNewReleases.js';
import { _resetKeywordGenreCache } from '../../keywordGenres.js';

const rails = [
  { key: 'horror', label: 'New in Horror', genreIds: [27], items: [{ id: 1, media_type: 'movie', genre_ids: [27] }] },
  { key: 'comedy', label: 'New in Comedy', genreIds: [35], items: [{ id: 2, media_type: 'tv', genre_ids: [35] }] },
  { key: 'action', label: 'New in Action', genreIds: [28], items: [{ id: 3, media_type: 'movie', genre_ids: [28] }] },
  { key: 'truecrime', label: 'New in True Crime', genreIds: [], items: [{ id: 4, media_type: 'tv', genre_ids: [] }] },
];

test('buildGenreRailDefinitions joins shared names and folds a movie genre into its broader TV genre', () => {
  const definitions = buildGenreRailDefinitions({
    movie: [{ id: 28, name: 'Action' }, { id: 12, name: 'Adventure' }, { id: 35, name: 'Comedy' }, { id: 878, name: 'Science Fiction' }],
    tv: [{ id: 10759, name: 'Action & Adventure' }, { id: 35, name: 'Comedy' }, { id: 10765, name: 'Sci-Fi & Fantasy' }],
  });

  assert.deepEqual(definitions.map(rail => rail.label), [
    'New in Action & Adventure',
    'New in Adventure',
    'New in Comedy',
    'New in Sci-Fi & Fantasy',
  ]);
  const action = definitions.find(rail => rail.key === 'action-and-adventure');
  assert.equal(action.movieGenreId, 28);
  assert.equal(action.tvGenreId, 10759);
  assert.deepEqual(action.genreIds, [28, 10759]);
  assert.deepEqual(definitions.find(rail => rail.key === 'comedy').genreIds, [35]);
});

test('buildGenreRailDefinitions keeps a movie genre on its own when its TV partner is missing', () => {
  const definitions = buildGenreRailDefinitions({ movie: [{ id: 28, name: 'Action' }], tv: [] });
  assert.deepEqual(definitions.map(rail => rail.label), ['New in Action']);
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

test('the load returns the genre rails alone, and asks for nothing the page no longer shows', async () => {
  // Ids are opaque fixture values from a fake client, never real TMDB ids.
  // No getRecentReleases or getTrending here: calling either would throw.
  const client = {
    async getGenreCatalog() { return { movie: [{ id: 35, name: 'Comedy' }], tv: [] }; },
    async getNowPlaying() { return { results: [{ id: 11 }] }; },
    async discoverNewestByGenre() {
      return { results: [{ id: 11, title: 'Out now', original_language: 'en', poster_path: '/a.jpg', release_date: '2026-01-02', genre_ids: [35] }] };
    },
  };
  const data = await loadNewReleaseData({ client });
  assert.deepEqual(Object.keys(data), ['genreRails']);
  assert.deepEqual(data.genreRails.map(rail => rail.key), ['comedy']);
  assert.equal(data.genreRails[0].items[0]._cinema, true);
});

// Keyword ids and titles below are opaque fixture values from a fake client.
test('Horror, Romance and Thriller rails add shows found by TMDB keyword', async () => {
  _resetKeywordGenreCache();
  const seen = [];
  const client = {
    async getNowPlaying() { return []; },
    async getGenreCatalog() {
      return { movie: [{ id: 27, name: 'Horror' }, { id: 35, name: 'Comedy' }], tv: [{ id: 35, name: 'Comedy' }] };
    },
    async searchKeyword(q) { return { results: q === 'horror' ? [{ id: 7001, name: 'horror' }] : [] }; },
    async discoverNewestByGenre(type, id) {
      return { results: [{ id: type === 'movie' ? 100 + id : 200 + id, title: 'M', name: 'S', original_language: 'en', poster_path: '/p.jpg', release_date: '2026-09-01', first_air_date: '2026-09-02', genre_ids: [id] }] };
    },
    async discoverNewestByKeyword(type, ids) {
      seen.push([type, ids]);
      return { results: [{ id: 999, name: 'Scary show', original_language: 'en', poster_path: '/s.jpg', first_air_date: '2026-09-03', genre_ids: [9648] }] };
    },
  };
  const defs = buildGenreRailDefinitions(await client.getGenreCatalog());
  assert.equal(defs.find(r => r.key === 'horror').tvKeywordGenre, 27);
  assert.equal(defs.find(r => r.key === 'comedy').tvKeywordGenre, undefined);

  const { genreRails } = await loadNewReleaseData({ client });
  assert.deepEqual(seen, [['tv', '7001']]);
  const horror = genreRails.find(r => r.key === 'horror');
  const show = horror.items.find(i => i.id === 999);
  assert.equal(show.media_type, 'tv');
  assert.ok(show.genre_ids.includes(27), 'kept by the page\'s Horror filter');
  const filtered = prepareNewReleaseGenreRails(genreRails, ['tv', 'movie', 'cinema'], [27]);
  assert.ok(filtered.find(r => r.key === 'horror').items.some(i => i.id === 999));
});
