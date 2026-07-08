import test from 'node:test';
import assert from 'node:assert/strict';
import { buildWatchLink } from '../../src/core/watchLinks.js';
import { configure } from '../../src/core/config.js';

const BASE = { title: 'The Test Movie', region: 'AU', justwatchLink: 'https://www.justwatch.com/au/movie/the-test-movie' };

test('known provider resolves to a search link when no affiliate tag is configured', () => {
  configure({ affiliate: undefined });
  const link = buildWatchLink({ ...BASE, providerName: 'Netflix' });
  assert.equal(link.kind, 'search');
  assert.equal(link.url, 'https://www.netflix.com/search?q=The%20Test%20Movie');
});

test('amazon uses the regional storefront and becomes affiliate when a tag exists', () => {
  configure({ affiliate: { amazonTags: { AU: 'plot-22' } } });
  const link = buildWatchLink({ ...BASE, providerName: 'Amazon Prime Video' });
  assert.equal(link.kind, 'affiliate');
  assert.ok(link.url.startsWith('https://www.amazon.com.au/s?k=The%20Test%20Movie'));
  assert.ok(link.url.includes('tag=plot-22'));

  configure({ affiliate: undefined });
  const plain = buildWatchLink({ ...BASE, providerName: 'Amazon Video' });
  assert.equal(plain.kind, 'search');
  assert.ok(!plain.url.includes('tag='));
});

test('amazon falls back to .com for unmapped regions', () => {
  configure({ affiliate: undefined });
  const link = buildWatchLink({ ...BASE, region: 'ZA', providerName: 'Amazon Prime Video' });
  assert.ok(link.url.startsWith('https://www.amazon.com/s?k='));
});

test('apple tv gets the at token when configured', () => {
  configure({ affiliate: { appleToken: 'plot_at' } });
  const link = buildWatchLink({ ...BASE, providerName: 'Apple TV+' });
  assert.equal(link.kind, 'affiliate');
  assert.ok(link.url.includes('at=plot_at'));
  configure({ affiliate: undefined });
});

test('max matches both Max and HBO Max but not e.g. Cinemax', () => {
  configure({ affiliate: undefined });
  assert.ok(buildWatchLink({ ...BASE, providerName: 'Max' }).url.includes('play.max.com'));
  assert.ok(buildWatchLink({ ...BASE, providerName: 'HBO Max' }).url.includes('play.max.com'));
  assert.equal(buildWatchLink({ ...BASE, providerName: 'Cinemax' }).kind, 'justwatch');
});

test('unknown provider falls back to the JustWatch link', () => {
  configure({ affiliate: undefined });
  const link = buildWatchLink({ ...BASE, providerName: 'Some Obscure Service' });
  assert.equal(link.kind, 'justwatch');
  assert.equal(link.url, BASE.justwatchLink);
});

test('no destination at all returns null (chip renders inert)', () => {
  configure({ affiliate: undefined });
  assert.equal(buildWatchLink({ providerName: 'Some Obscure Service', title: 'X', region: 'AU', justwatchLink: null }), null);
});
