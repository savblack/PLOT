import assert from 'node:assert/strict';
import test from 'node:test';
import { baseMediaRow, mediaIdentityRow, recommendationsFromDetails } from '@plot/core/media.js';

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

test('recommendationsFromDetails reads the row TMDB nests in the details payload', () => {
  const details = {
    recommendations: {
      results: [
        { id: 11, media_type: 'movie', title: 'Example Movie', poster_path: '/a.jpg', release_date: '2024-03-04' },
        { id: 12, media_type: 'tv', name: 'Example Series', poster_path: '/b.jpg', first_air_date: '2023-01-02' },
      ],
    },
  };
  assert.deepEqual(recommendationsFromDetails(details).map(item => item.id), [11, 12]);
});

test('recommendationsFromDetails drops entries that would render as empty poster slots', () => {
  const details = {
    recommendations: {
      results: [
        { id: 21, media_type: 'movie', title: 'Has Artwork', poster_path: '/a.jpg' },
        { id: 22, media_type: 'movie', title: 'No Artwork', poster_path: null },
        { media_type: 'movie', title: 'No Id', poster_path: '/c.jpg' },
      ],
    },
  };
  assert.deepEqual(recommendationsFromDetails(details).map(item => item.id), [21]);
});

test('recommendationsFromDetails keeps the same id under two media types but drops true repeats', () => {
  const details = {
    recommendations: {
      results: [
        { id: 31, media_type: 'movie', title: 'Same Id Movie', poster_path: '/a.jpg' },
        { id: 31, media_type: 'tv', name: 'Same Id Series', poster_path: '/b.jpg' },
        { id: 31, media_type: 'movie', title: 'Repeat', poster_path: '/c.jpg' },
      ],
    },
  };
  assert.deepEqual(
    recommendationsFromDetails(details).map(item => `${item.media_type}-${item.id}`),
    ['movie-31', 'tv-31'],
  );
});

test('recommendationsFromDetails caps the row and tolerates a details payload without recommendations', () => {
  const many = { recommendations: { results: Array.from({ length: 20 }, (_unused, i) => ({ id: 100 + i, media_type: 'movie', title: `Example ${i}`, poster_path: `/${i}.jpg` })) } };
  assert.equal(recommendationsFromDetails(many).length, 12);
  assert.equal(recommendationsFromDetails(many, { limit: 4 }).length, 4);
  assert.deepEqual(recommendationsFromDetails({}), []);
  assert.deepEqual(recommendationsFromDetails(undefined), []);
});
