import { test } from 'node:test';
import assert from 'node:assert/strict';
import { marketingFeedPage, feedCacheKey } from './whats-on.js';

const SHAREABLE = 'public, s-maxage=3600, stale-while-revalidate=86400';

function fakeCache() {
  const store = new Map();
  return {
    store,
    async match(req) { const hit = store.get(req.url); return hit ? hit.clone() : undefined; },
    async put(req, res) { store.set(req.url, res); },
  };
}

async function withCache(run, upstream = () => new Response('<!doctype html>feed', { status: 200, headers: { 'cache-control': SHAREABLE } })) {
  const realFetch = globalThis.fetch;
  const realCaches = globalThis.caches;
  const cache = fakeCache();
  const calls = [];
  globalThis.caches = { default: cache };
  globalThis.fetch = (url) => { calls.push(new URL(url)); return Promise.resolve(upstream(calls.length)); };
  const pending = [];
  const get = (href, slug = null, method = 'GET') =>
    marketingFeedPage(new Request(href, { method }), slug, (p) => pending.push(p));
  try {
    await run({ get, cache, calls, settle: () => Promise.all(pending) });
  } finally {
    globalThis.fetch = realFetch;
    if (realCaches === undefined) delete globalThis.caches; else globalThis.caches = realCaches;
  }
}

test('tracking parameters share one What\'s On entry', () => {
  const a = feedCacheKey(new URL('https://theplot.tv/whats-on?utm_source=x'), null);
  const b = feedCacheKey(new URL('https://theplot.tv/whats-on?fbclid=abc'), null);
  const typed = feedCacheKey(new URL('https://theplot.tv/whats-on?type=upcoming'), null);
  assert.equal(a.url, b.url);
  assert.notEqual(a.url, typed.url);
});

test('a second request for the same feed page skips the Edge Function', async () => {
  await withCache(async ({ get, calls, settle }) => {
    const first = await get('https://theplot.tv/whats-on');
    await settle();
    assert.equal(first.headers.get('x-plot-cache'), 'miss');
    const second = await get('https://theplot.tv/whats-on?utm_source=buffer');
    assert.equal(second.headers.get('x-plot-cache'), 'hit');
    assert.equal(await second.text(), '<!doctype html>feed');
    assert.equal(calls.length, 1);
  });
});

test('page and type are separate entries', async () => {
  await withCache(async ({ get, calls, settle }) => {
    await get('https://theplot.tv/whats-on');
    await settle();
    assert.equal((await get('https://theplot.tv/whats-on?page=2')).headers.get('x-plot-cache'), 'miss');
    await settle();
    assert.equal((await get('https://theplot.tv/whats-on?type=upcoming')).headers.get('x-plot-cache'), 'miss');
    await settle();
    assert.equal(calls.length, 3);
    assert.equal((await get('https://theplot.tv/whats-on?page=2')).headers.get('x-plot-cache'), 'hit');
  });
});

test('a slug is its own entry', async () => {
  await withCache(async ({ get, calls, settle }) => {
    await get('https://theplot.tv/whats-on/lanterns-works', 'lanterns-works');
    await settle();
    assert.equal((await get('https://theplot.tv/whats-on')).headers.get('x-plot-cache'), 'miss');
    assert.equal(calls.length, 2);
  });
});

test('errors and unmarked pages are not kept', async () => {
  for (const make of [
    () => new Response('nope', { status: 404, headers: { 'cache-control': SHAREABLE } }),
    () => new Response('down', { status: 503, headers: { 'cache-control': SHAREABLE } }),
    () => new Response('page', { status: 200, headers: { 'cache-control': 'no-store' } }),
  ]) {
    await withCache(async ({ get, cache, calls, settle }) => {
      await get('https://theplot.tv/whats-on');
      await settle();
      assert.equal(cache.store.size, 0);
      await get('https://theplot.tv/whats-on');
      assert.equal(calls.length, 2);
    }, make);
  }
});

test('an unsuccessful upstream page is never shareable downstream', async () => {
  await withCache(async ({ get }) => {
    const response = await get('https://theplot.tv/whats-on');
    assert.equal(response.status, 503);
    assert.equal(response.headers.get('cache-control'), 'no-store');
  }, () => new Response('down', { status: 503, headers: { 'cache-control': SHAREABLE } }));
});

test('a fetch failure returns the fallback and caches nothing', async () => {
  const real = globalThis.fetch;
  const realCaches = globalThis.caches;
  const cache = fakeCache();
  globalThis.caches = { default: cache };
  globalThis.fetch = () => Promise.reject(new Error('network'));
  try {
    const res = await marketingFeedPage(new Request('https://theplot.tv/whats-on'), null);
    assert.equal(res.status, 502);
    assert.equal(cache.store.size, 0);
  } finally {
    globalThis.fetch = real;
    if (realCaches === undefined) delete globalThis.caches; else globalThis.caches = realCaches;
  }
});

test('a search is forwarded, never cached, and sent no-store', async () => {
  await withCache(async ({ get, cache, calls, settle }) => {
    const first = await get('https://theplot.tv/whats-on?q=%20dune%20%20part%20two%20&utm_source=x');
    await settle();
    assert.equal(calls[0].searchParams.get('q'), 'dune part two');
    assert.equal(calls[0].searchParams.get('utm_source'), null);
    assert.equal(first.headers.get('cache-control'), 'no-store');
    assert.equal(cache.store.size, 0);
    await get('https://theplot.tv/whats-on?q=dune%20part%20two');
    assert.equal(calls.length, 2);
  });
});

test('a blank search is the cached front page', async () => {
  await withCache(async ({ get, calls, settle }) => {
    await get('https://theplot.tv/whats-on?q=%20%20');
    await settle();
    assert.equal(calls[0].searchParams.has('q'), false);
    const again = await get('https://theplot.tv/whats-on');
    assert.equal(again.headers.get('x-plot-cache'), 'hit');
  });
});

test('a search term is capped at 80 characters', async () => {
  await withCache(async ({ get, calls }) => {
    await get(`https://theplot.tv/whats-on?q=${'a'.repeat(200)}`);
    assert.equal(calls[0].searchParams.get('q').length, 80);
  });
});
