import test from 'node:test';
import assert from 'node:assert/strict';
import { buildSimklHistoryBody, parseSimklHistory } from '../../../../supabase/functions/_shared/simklSync.js';

test('parseSimklHistory reads completed movies and shows with TMDB ids', () => {
  assert.deepEqual(parseSimklHistory({ movies: [{
    movie: { title: 'Arrival', ids: { simkl: 1, tmdb: 329865 } },
    last_watched_at: '2026-09-20T12:00:00Z', user_rating: 9,
  }] }, { shows: [{
    show: { title: 'Severance', ids: { simkl: 2, tmdb: 95396 } },
    last_watched_at: '2026-09-21T12:00:00Z',
  }] }), [
    { tmdb_id: 329865, media_type: 'movie', title: 'Arrival', watched_at: '2026-09-20', rating: 9 },
    { tmdb_id: 95396, media_type: 'tv', title: 'Severance', watched_at: '2026-09-21', rating: null },
  ]);
});

test('parseSimklHistory skips entries Plot cannot identify safely', () => {
  assert.deepEqual(parseSimklHistory({ movies: [
    { movie: { title: 'No TMDB id', ids: { simkl: 1 } } },
    { movie: { ids: { tmdb: 2 } } },
  ] }, {}), []);
});

test('buildSimklHistoryBody separates movies and shows without inventing ids', () => {
  const body = buildSimklHistoryBody([
    { tmdb_id: 329865, media_type: 'movie', watched_at: '2026-09-20' },
    { tmdb_id: 95396, media_type: 'tv', watched_at: '2026-09-21' },
    { tmdb_id: null, media_type: 'movie' },
  ]);
  assert.equal(body.movies[0].ids.tmdb, 329865);
  assert.equal(body.shows[0].ids.tmdb, 95396);
  assert.equal(body.movies.length, 1);
  assert.equal(body.shows.length, 1);
});
