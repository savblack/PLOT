import test from 'node:test';
import assert from 'node:assert/strict';
import { buildWatchLink } from '@plot/core/watchLinks.js';
import { formatOfferPrice, offersFromTmdb } from '@plot/core/availability.js';

test('uses a verified provider title URL and never constructs a provider search URL', () => {
  const link = buildWatchLink({
    providerUrl: 'https://click.justwatch.com/a?offer=123',
    justwatchLink: 'https://www.justwatch.com/au/movie/the-test-movie',
  });
  assert.deepEqual(link, { url: 'https://click.justwatch.com/a?offer=123', kind: 'provider' });
});

test('falls back only to the exact regional JustWatch title page', () => {
  const link = buildWatchLink({
    providerUrl: null,
    justwatchLink: 'https://www.justwatch.com/au/movie/the-test-movie',
  });
  assert.deepEqual(link, { url: 'https://www.justwatch.com/au/movie/the-test-movie', kind: 'justwatch' });
  assert.equal(buildWatchLink({ providerUrl: 'javascript:alert(1)', justwatchLink: null }), null);
});

test('TMDB availability retains each offer category without inventing a price', () => {
  const offers = offersFromTmdb({
    flatrate: [{ provider_id: 8, provider_name: 'Netflix', logo_path: '/netflix.png' }],
    rent: [{ provider_id: 10, provider_name: 'Amazon Video', logo_path: '/amazon.png' }],
    buy: [{ provider_id: 10, provider_name: 'Amazon Video', logo_path: '/amazon.png' }],
    free: [{ provider_id: 20, provider_name: 'ABC iview', logo_path: '/abc.png' }],
  });
  assert.deepEqual(offers.map(({ providerName, offerType, price }) => ({ providerName, offerType, price })), [
    { providerName: 'Netflix', offerType: 'Subscription', price: null },
    { providerName: 'Amazon Video', offerType: 'Rent', price: null },
    { providerName: 'Amazon Video', offerType: 'Buy', price: null },
    { providerName: 'ABC iview', offerType: 'Free', price: null },
  ]);
});

test('formats a verified price only when both amount and currency exist', () => {
  assert.equal(formatOfferPrice(4.99, 'AUD'), '$4.99');
  assert.equal(formatOfferPrice(null, 'AUD'), null);
});
