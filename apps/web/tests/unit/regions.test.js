import assert from 'node:assert/strict';
import test from 'node:test';

import { detectRegion, guessRegionFromTimezone, SUPPORTED_REGIONS } from '@plot/core/regions.js';

const ok = (body) => async () => ({ ok: true, json: async () => body });

test('guessRegionFromTimezone maps every Australian zone to AU, not just listed ones', () => {
  assert.equal(guessRegionFromTimezone('Australia/Sydney'), 'AU');
  assert.equal(guessRegionFromTimezone('Australia/Perth'), 'AU', 'unlisted Australian zone still maps to AU');
});

test('guessRegionFromTimezone maps known zones and falls back to US', () => {
  assert.equal(guessRegionFromTimezone('Europe/London'), 'GB');
  assert.equal(guessRegionFromTimezone('America/Los_Angeles'), 'US');
  assert.equal(guessRegionFromTimezone('Antarctica/Troll'), 'US', 'unknown zone falls back rather than returning null');
});

test('detectRegion prefers a supported IP-geolocated country over the timezone guess', async () => {
  const region = await detectRegion({
    endpoint: '/api/region',
    fetchImpl: ok({ country: 'NZ' }),
    fallback: 'US',
  });

  assert.equal(region, 'NZ');
});

test('detectRegion keeps the fallback for a country the app has no data for', async () => {
  const region = await detectRegion({
    endpoint: '/api/region',
    fetchImpl: ok({ country: 'ZZ' }),
    fallback: 'AU',
  });

  assert.equal(region, 'AU');
  assert.ok(!SUPPORTED_REGIONS.includes('ZZ'));
});

test('detectRegion never throws and never returns null when the lookup fails', async () => {
  const cases = [
    async () => { throw new Error('offline'); },
    async () => ({ ok: false, json: async () => ({ country: 'GB' }) }),
    async () => ({ ok: true, json: async () => { throw new Error('bad json'); } }),
    async () => ({ ok: true, json: async () => ({}) }),
  ];

  for (const fetchImpl of cases) {
    // Onboarding writes whatever this returns, so a failed lookup has to
    // degrade to the guess rather than leaving the profile without a region.
    assert.equal(await detectRegion({ endpoint: '/api/region', fetchImpl, fallback: 'AU' }), 'AU');
  }

  assert.equal(await detectRegion({ fallback: 'GB' }), 'GB', 'missing endpoint degrades too');
});
