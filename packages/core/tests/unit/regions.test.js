import assert from 'node:assert/strict';
import test from 'node:test';

import {
  REGIONS,
  SUPPORTED_REGIONS,
  DEFAULT_REGION,
  isSupportedRegion,
  regionName,
  detectTimezone,
  guessRegionFromTimezone,
  detectRegion,
} from '../../regions.js';

function withTZ(tz, fn) {
  const original = process.env.TZ;
  process.env.TZ = tz;
  try {
    return fn();
  } finally {
    if (original === undefined) delete process.env.TZ;
    else process.env.TZ = original;
  }
}

test('REGIONS starts with the three regions PLOT has real traffic data for', () => {
  assert.deepEqual(REGIONS.slice(0, 3), [
    { code: 'US', name: 'United States' },
    { code: 'AU', name: 'Australia' },
    { code: 'IN', name: 'India' },
  ]);
});

test('SUPPORTED_REGIONS is derived from REGIONS in the same order', () => {
  assert.deepEqual(SUPPORTED_REGIONS, REGIONS.map(r => r.code));
});

test('DEFAULT_REGION is US', () => {
  assert.equal(DEFAULT_REGION, 'US');
});

test('isSupportedRegion is case-insensitive and rejects unknown/empty codes', () => {
  assert.equal(isSupportedRegion('US'), true);
  assert.equal(isSupportedRegion('us'), true);
  assert.equal(isSupportedRegion('zz'), false);
  assert.equal(isSupportedRegion(null), false);
  assert.equal(isSupportedRegion(undefined), false);
  assert.equal(isSupportedRegion(''), false);
});

test('regionName looks up the display name for a supported code', () => {
  assert.equal(regionName('US'), 'United States');
  assert.equal(regionName('SG'), 'Singapore');
});

test('regionName falls back to the code itself when unrecognized, and to empty string when nullish', () => {
  assert.equal(regionName('ZZ'), 'ZZ');
  assert.equal(regionName(null), '');
  assert.equal(regionName(undefined), '');
});

test('detectTimezone returns whatever Intl resolves, defaulting gracefully', () => {
  const tz = detectTimezone();
  assert.equal(typeof tz, 'string');
  assert.ok(tz.length > 0);
  assert.equal(tz, Intl.DateTimeFormat().resolvedOptions().timeZone);
});

test('guessRegionFromTimezone maps known IANA zones to their region code', () => {
  assert.equal(guessRegionFromTimezone('America/New_York'), 'US');
  assert.equal(guessRegionFromTimezone('Europe/London'), 'GB');
  assert.equal(guessRegionFromTimezone('Pacific/Auckland'), 'NZ');
});

test('guessRegionFromTimezone maps any Australia/* zone to AU even when not individually listed', () => {
  assert.equal(guessRegionFromTimezone('Australia/Perth'), 'AU');
});

test('guessRegionFromTimezone falls back to DEFAULT_REGION for an unmapped zone', () => {
  assert.equal(guessRegionFromTimezone('Europe/Madrid'), DEFAULT_REGION);
});

test('guessRegionFromTimezone defaults to the device timezone when no argument is given', () => {
  withTZ('America/Chicago', () => {
    assert.equal(guessRegionFromTimezone(), 'US');
  });
});

test('BUG: TZ_MAP maps Asia/Seoul to KR, a code that is not in SUPPORTED_REGIONS', () => {
  assert.equal(guessRegionFromTimezone('Asia/Seoul'), 'KR');
  assert.equal(isSupportedRegion('KR'), false);
  assert.equal(SUPPORTED_REGIONS.includes('KR'), false);
});

test('BUG: detectRegion returns that unsupported timezone-derived fallback unvalidated when there is no endpoint', async () => {
  const region = await detectRegion({ fallback: guessRegionFromTimezone('Asia/Seoul') });
  assert.equal(region, 'KR');
});

test('detectRegion returns the fallback immediately when no endpoint is given', async () => {
  const region = await detectRegion({ fallback: 'CA' });
  assert.equal(region, 'CA');
});

test('detectRegion uses the geolocation result when it resolves to a supported region', async () => {
  const region = await detectRegion({
    endpoint: 'https://example.test/region',
    fetchImpl: async () => ({ ok: true, json: async () => ({ country: 'gb' }) }),
    fallback: 'US',
  });
  assert.equal(region, 'GB', 'uppercases the geolocation country code');
});

test('detectRegion keeps the fallback when the geolocation result is unsupported', async () => {
  const region = await detectRegion({
    endpoint: 'https://example.test/region',
    fetchImpl: async () => ({ ok: true, json: async () => ({ country: 'zz' }) }),
    fallback: 'US',
  });
  assert.equal(region, 'US');
});

test('detectRegion keeps the fallback when the response is not ok', async () => {
  const region = await detectRegion({
    endpoint: 'https://example.test/region',
    fetchImpl: async () => ({ ok: false }),
    fallback: 'CA',
  });
  assert.equal(region, 'CA');
});

test('detectRegion keeps the fallback when fetch rejects', async () => {
  const region = await detectRegion({
    endpoint: 'https://example.test/region',
    fetchImpl: async () => { throw new Error('network down'); },
    fallback: 'CA',
  });
  assert.equal(region, 'CA');
});

test('detectRegion keeps the fallback when the response body is not valid JSON', async () => {
  const region = await detectRegion({
    endpoint: 'https://example.test/region',
    fetchImpl: async () => ({ ok: true, json: async () => { throw new Error('bad json'); } }),
    fallback: 'CA',
  });
  assert.equal(region, 'CA');
});
