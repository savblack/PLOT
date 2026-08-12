import assert from 'node:assert/strict';
import test from 'node:test';
import { baseMediaRow, mediaIdentityRow } from '@plot/core/media.js';

test('baseMediaRow preserves release date for watchlist-style tables', () => {
  assert.deepEqual(baseMediaRow({
    id: 202,
    media_type: 'tv',
    name: 'Example Series',
    first_air_date: '2024-02-01',
    poster_path: '/poster.jpg',
  }), {
    tmdb_id: 202,
    media_type: 'tv',
    title: 'Example Series',
    poster_path: '/poster.jpg',
    release_date: '2024-02-01',
  });
});

test('mediaIdentityRow omits release date for favourites and custom lists', () => {
  assert.deepEqual(mediaIdentityRow({
    id: 202,
    media_type: 'tv',
    name: 'Example Series',
    first_air_date: '2024-02-01',
    poster_path: '/poster.jpg',
  }), {
    tmdb_id: 202,
    media_type: 'tv',
    title: 'Example Series',
    poster_path: '/poster.jpg',
  });
});
