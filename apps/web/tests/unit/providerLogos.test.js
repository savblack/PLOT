import assert from 'node:assert/strict';
import test from 'node:test';

import {
  buildProviderLogoCacheKey,
  collectPendingProviderLogoRequests,
} from '../../src/utils/providerLogos.js';

test('buildProviderLogoCacheKey includes type, id, and region', () => {
  assert.equal(
    buildProviderLogoCacheKey({ id: 42, type: 'tv', region: 'AU' }),
    'tv-42-AU'
  );
});

test('collectPendingProviderLogoRequests dedupes repeated guide items', () => {
  const requests = collectPendingProviderLogoRequests(
    [
      { id: 10, media_type: 'movie' },
      { id: 10, media_type: 'movie' },
      { id: 99, media_type: 'tv' },
    ],
    'US',
    new Map()
  );

  assert.deepEqual(
    requests,
    [
      { id: 10, key: 'movie-10-US', type: 'movie' },
      { id: 99, key: 'tv-99-US', type: 'tv' },
    ]
  );
});

test('collectPendingProviderLogoRequests skips keys that are already cached', () => {
  const cache = new Map([['movie-10-US', '/logo.png']]);
  const requests = collectPendingProviderLogoRequests(
    [
      { id: 10, media_type: 'movie' },
      { id: 11, media_type: 'movie' },
    ],
    'US',
    cache
  );

  assert.deepEqual(requests, [{ id: 11, key: 'movie-11-US', type: 'movie' }]);
});
