import assert from 'node:assert/strict';
import test from 'node:test';

import { offersFromTmdb, formatOfferPrice, fetchVerifiedAvailability } from '../../availability.js';
import { configure } from '../../config.js';

const originalFetch = globalThis.fetch;

test.afterEach(() => {
  globalThis.fetch = originalFetch;
  configure({ watchAvailabilityUrl: '', supabaseAnonKey: '' });
});

test('offersFromTmdb maps each TMDB offer bucket to its display offer type', () => {
  const offers = offersFromTmdb({
    flatrate: [{ provider_id: 8, provider_name: 'Netflix', logo_path: '/n.png' }],
    buy: [{ provider_id: 2, provider_name: 'Apple TV' }],
  });
  assert.deepEqual(offers, [
    { providerId: 8, providerName: 'Netflix', logoPath: '/n.png', offerType: 'Subscription', price: null, currency: null, providerUrl: null },
    { providerId: 2, providerName: 'Apple TV', logoPath: null, offerType: 'Buy', price: null, currency: null, providerUrl: null },
  ]);
});

test('offersFromTmdb returns an empty array for empty, missing, or absent region data', () => {
  assert.deepEqual(offersFromTmdb({}), []);
  assert.deepEqual(offersFromTmdb(), []);
  assert.deepEqual(offersFromTmdb(null), []);
});

test('formatOfferPrice formats a price in the given currency and locale', () => {
  assert.equal(formatOfferPrice(9.99, 'AUD', 'en-AU'), '$9.99');
});

test('formatOfferPrice qualifies a non-local currency with its ISO code', () => {
  assert.equal(formatOfferPrice(9.99, 'USD'), 'USD\u00A09.99');
});

test('formatOfferPrice returns null for a non-finite price or a missing currency', () => {
  assert.equal(formatOfferPrice(null, 'USD'), null);
  assert.equal(formatOfferPrice(NaN, 'USD'), null);
  assert.equal(formatOfferPrice(9.99, null), null);
});

test('formatOfferPrice falls back to a plain "price currency" string when Intl rejects the currency', () => {
  assert.equal(formatOfferPrice(5, 'NOTACURRENCY'), '5 NOTACURRENCY');
});

test('fetchVerifiedAvailability returns null without calling fetch when watchAvailabilityUrl is not configured', async () => {
  let called = false;
  globalThis.fetch = async () => { called = true; return { ok: true, json: async () => ({}) }; };
  const result = await fetchVerifiedAvailability({ tmdbId: 1, mediaType: 'movie', region: 'US' });
  assert.equal(result, null);
  assert.equal(called, false);
});

test('fetchVerifiedAvailability returns null when tmdbId or region is missing, even if configured', async () => {
  configure({ watchAvailabilityUrl: 'https://example.test/avail' });
  assert.equal(await fetchVerifiedAvailability({ mediaType: 'movie', region: 'US' }), null);
  assert.equal(await fetchVerifiedAvailability({ tmdbId: 1, mediaType: 'movie' }), null);
});

test('fetchVerifiedAvailability builds the request URL and auth headers from config, and returns verified data', async () => {
  configure({ watchAvailabilityUrl: 'https://example.test/avail', supabaseAnonKey: 'anon123' });
  let capturedUrl, capturedHeaders;
  globalThis.fetch = async (url, opts) => {
    capturedUrl = url;
    capturedHeaders = opts?.headers;
    return { ok: true, json: async () => ({ title_verified: true, offers: [{ providerId: 1 }] }) };
  };

  const result = await fetchVerifiedAvailability({ tmdbId: 42, mediaType: 'tv', region: 'GB' });

  assert.deepEqual(result, { title_verified: true, offers: [{ providerId: 1 }] });
  assert.equal(capturedUrl.toString(), 'https://example.test/avail?tmdb_id=42&media_type=tv&region=GB');
  assert.deepEqual(capturedHeaders, { Authorization: 'Bearer anon123', apikey: 'anon123' });
});

test('fetchVerifiedAvailability omits auth headers when no anon key is configured', async () => {
  configure({ watchAvailabilityUrl: 'https://example.test/avail', supabaseAnonKey: '' });
  let capturedHeaders;
  globalThis.fetch = async (url, opts) => {
    capturedHeaders = opts?.headers;
    return { ok: true, json: async () => ({ title_verified: true, offers: [] }) };
  };

  await fetchVerifiedAvailability({ tmdbId: 1, mediaType: 'movie', region: 'US' });
  assert.deepEqual(capturedHeaders, {});
});

test('fetchVerifiedAvailability returns null when the response is not ok', async () => {
  configure({ watchAvailabilityUrl: 'https://example.test/avail' });
  globalThis.fetch = async () => ({ ok: false });
  assert.equal(await fetchVerifiedAvailability({ tmdbId: 1, mediaType: 'movie', region: 'US' }), null);
});

test('fetchVerifiedAvailability returns null when title_verified is not exactly true', async () => {
  configure({ watchAvailabilityUrl: 'https://example.test/avail' });
  globalThis.fetch = async () => ({ ok: true, json: async () => ({ title_verified: false, offers: [] }) });
  assert.equal(await fetchVerifiedAvailability({ tmdbId: 1, mediaType: 'movie', region: 'US' }), null);
});

test('fetchVerifiedAvailability returns null when offers is not an array', async () => {
  configure({ watchAvailabilityUrl: 'https://example.test/avail' });
  globalThis.fetch = async () => ({ ok: true, json: async () => ({ title_verified: true, offers: 'nope' }) });
  assert.equal(await fetchVerifiedAvailability({ tmdbId: 1, mediaType: 'movie', region: 'US' }), null);
});

test('fetchVerifiedAvailability swallows a fetch rejection and returns null', async () => {
  configure({ watchAvailabilityUrl: 'https://example.test/avail' });
  globalThis.fetch = async () => { throw new Error('network down'); };
  assert.equal(await fetchVerifiedAvailability({ tmdbId: 1, mediaType: 'movie', region: 'US' }), null);
});
