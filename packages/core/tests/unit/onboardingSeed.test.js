import test from 'node:test';
import assert from 'node:assert/strict';
import {
  SEED_SEARCH_COUNT, SEED_TRENDING_COUNT, loadSeedTrending, searchSeedTitles, seedSearchFrom, seedTrendingFrom,
} from '../../onboardingSeed.js';

// Made-up rows. Ids are negative on purpose: they are not TMDB ids.
const row = (i, extra = {}) => ({ id: -(i + 1), media_type: i % 2 ? 'movie' : 'tv', poster_path: `/p${i}.jpg`, ...extra });

test('a search that never reached TMDB is a failure, not "nothing matched"', () => {
  assert.deepEqual(seedSearchFrom(null), { ok: false, items: [] });
  assert.deepEqual(seedSearchFrom(undefined), { ok: false, items: [] });
  assert.deepEqual(seedSearchFrom({}), { ok: false, items: [] });
});

test('a search that matched nothing is an empty success', () => {
  assert.deepEqual(seedSearchFrom({ results: [] }), { ok: true, items: [] });
  // People and posterless titles can't go in a poster grid.
  const load = seedSearchFrom({ results: [{ id: -1, media_type: 'person' }, row(1, { poster_path: null })] });
  assert.deepEqual(load, { ok: true, items: [] });
});

test('search keeps movies and shows with posters, capped', () => {
  const load = seedSearchFrom({ results: Array.from({ length: 40 }, (_, i) => row(i)) });
  assert.equal(load.ok, true);
  assert.equal(load.items.length, SEED_SEARCH_COUNT);
});

test('no trending titles at all means every page failed', () => {
  assert.deepEqual(seedTrendingFrom({ results: [] }), { ok: false, items: [] });
  assert.deepEqual(seedTrendingFrom(null), { ok: false, items: [] });
});

test('trending drops a title that landed on two pages, and caps the grid', () => {
  const load = seedTrendingFrom({ results: [row(0), row(0), row(1)] });
  assert.deepEqual(load.items.map(r => r.id), [-1, -2]);
  const many = seedTrendingFrom({ results: Array.from({ length: 60 }, (_, i) => row(i)) });
  assert.equal(many.items.length, SEED_TRENDING_COUNT);
});

test('the loaders turn a null read or a throw into a failure', async () => {
  assert.deepEqual(await searchSeedTitles({ search: async () => null }, 'x'), { ok: false, items: [] });
  assert.deepEqual(await searchSeedTitles({ search: async () => { throw new Error('offline'); } }, 'x'), { ok: false, items: [] });
  assert.deepEqual(await loadSeedTrending({ getTrending: async () => ({ results: [] }) }), { ok: false, items: [] });
  assert.deepEqual(await loadSeedTrending({ getTrending: async () => { throw new Error('offline'); } }), { ok: false, items: [] });
  const ok = await searchSeedTitles({ search: async () => ({ results: [row(0)] }) }, 'x');
  assert.deepEqual(ok, { ok: true, items: [row(0)] });
});
