import assert from 'node:assert/strict';
import test from 'node:test';

import { buildProviderLogoCacheKey, collectPendingProviderLogoRequests } from '../../providerLogos.js';

test('buildProviderLogoCacheKey joins type, id, and region', () => {
  assert.equal(buildProviderLogoCacheKey({ id: 1, type: 'movie', region: 'US' }), 'movie-1-US');
});

test('collectPendingProviderLogoRequests returns an empty array for no items or a missing region', () => {
  assert.deepEqual(collectPendingProviderLogoRequests([], 'US'), []);
  assert.deepEqual(collectPendingProviderLogoRequests(undefined, 'US'), []);
  assert.deepEqual(collectPendingProviderLogoRequests([{ id: 1, media_type: 'movie' }], null), []);
});

test('collectPendingProviderLogoRequests reads id or tmdb_id and defaults media_type to movie', () => {
  assert.deepEqual(collectPendingProviderLogoRequests([{ id: 1, media_type: 'movie' }], 'US'), [
    { id: 1, key: 'movie-1-US', type: 'movie' },
  ]);
  assert.deepEqual(collectPendingProviderLogoRequests([{ tmdb_id: 2, media_type: 'tv' }], 'US'), [
    { id: 2, key: 'tv-2-US', type: 'tv' },
  ]);
  assert.deepEqual(collectPendingProviderLogoRequests([{ id: 1 }], 'US'), [
    { id: 1, key: 'movie-1-US', type: 'movie' },
  ]);
});

test('collectPendingProviderLogoRequests falls back to tmdb_id when id is falsy, and drops items with no usable id at all', () => {
  assert.deepEqual(collectPendingProviderLogoRequests([{ id: 0, tmdb_id: 5, media_type: 'movie' }], 'US'), [
    { id: 5, key: 'movie-5-US', type: 'movie' },
  ]);
  assert.deepEqual(collectPendingProviderLogoRequests([{ id: 0, media_type: 'movie' }], 'US'), []);
});

test('collectPendingProviderLogoRequests de-duplicates repeated items within the same call', () => {
  const items = [{ id: 1, media_type: 'movie' }, { id: 1, media_type: 'movie' }];
  assert.deepEqual(collectPendingProviderLogoRequests(items, 'US'), [{ id: 1, key: 'movie-1-US', type: 'movie' }]);
});

test('collectPendingProviderLogoRequests skips keys already present in the given cache', () => {
  const cache = new Map([['movie-1-US', { some: 'cached-value' }]]);
  assert.deepEqual(collectPendingProviderLogoRequests([{ id: 1, media_type: 'movie' }], 'US', cache), []);
});

test('collectPendingProviderLogoRequests treats different media_type or region as distinct keys', () => {
  const items = [{ id: 1, media_type: 'movie' }, { id: 1, media_type: 'tv' }, { id: 1, media_type: 'movie' }];
  assert.deepEqual(collectPendingProviderLogoRequests(items, 'GB'), [
    { id: 1, key: 'movie-1-GB', type: 'movie' },
    { id: 1, key: 'tv-1-GB', type: 'tv' },
  ]);
});
