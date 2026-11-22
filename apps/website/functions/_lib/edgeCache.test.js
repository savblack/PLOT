import { test } from 'node:test';
import assert from 'node:assert/strict';
import { cacheWindows, freshness, lookup, storedCopy } from './edgeCache.js';

const SHAREABLE = 'public, s-maxage=3600, stale-while-revalidate=86400';
const HOUR = 3600 * 1000;

test('cache windows come from s-maxage and stale-while-revalidate', () => {
  assert.deepEqual(cacheWindows(SHAREABLE), { fresh: 3600, stale: 86400 });
  assert.deepEqual(cacheWindows('public, max-age=60'), { fresh: 0, stale: 0 });
  assert.deepEqual(cacheWindows(null), { fresh: 0, stale: 0 });
});

test('a stored copy lives for both windows and remembers when it was stored', () => {
  const copy = storedCopy(new Response('x', { headers: { 'cache-control': SHAREABLE } }), 1000);
  assert.equal(copy.headers.get('cache-control'), 'public, max-age=90000');
  assert.equal(freshness(copy, 1000 + HOUR - 1), 'fresh');
  assert.equal(freshness(copy, 1000 + HOUR), 'stale');
  assert.equal(freshness(copy, 1000 + 25 * HOUR), 'expired');
});

test('an entry stored before stamping counts as fresh', () => {
  assert.equal(freshness(new Response('x', { headers: { 'cache-control': SHAREABLE } }), Date.now()), 'fresh');
});

function oneEntryCache(entry) {
  const puts = [];
  return { puts, async match() { return entry && entry.clone(); }, async put(_req, res) { puts.push(res); } };
}

const KEY = new Request('https://theplot.tv/x');
const page = (body) => new Response(body, { status: 200, headers: { 'cache-control': SHAREABLE } });

test('a stale HEAD is served but never refreshes the cache', async () => {
  const cache = oneEntryCache(storedCopy(page('old'), Date.now() - 2 * HOUR));
  let renders = 0;
  const res = await lookup(cache, KEY, { method: 'HEAD', render: async () => { renders++; return page('new'); } });
  assert.equal(res.headers.get('x-plot-cache'), 'stale');
  assert.equal(renders, 0);
  assert.equal(cache.puts.length, 0);
});

test('a render that throws during a refresh leaves the old copy and still serves it', async () => {
  const cache = oneEntryCache(storedCopy(page('old'), Date.now() - 2 * HOUR));
  const res = await lookup(cache, KEY, { method: 'GET', render: async () => { throw new Error('down'); } });
  assert.equal(await res.text(), 'old');
  assert.equal(cache.puts.length, 0);
});

test('a cache fault is a miss', async () => {
  const cache = { async match() { throw new Error('fault'); } };
  assert.equal(await lookup(cache, KEY, { method: 'GET', render: async () => page('x') }), null);
});
