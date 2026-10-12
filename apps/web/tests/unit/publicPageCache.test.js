import assert from 'node:assert/strict';
import { test } from 'node:test';
import { cachePage, cacheable } from '../../../../functions/_lib/edgeCache.js';

function fakeCache() {
  const store = new Map();
  return {
    store,
    async match(request) { const hit = store.get(request.url); return hit ? hit.clone() : undefined; },
    async put(request, response) { store.set(request.url, response); },
  };
}

async function withCache(run) {
  const realCaches = globalThis.caches;
  const cache = fakeCache();
  const pending = [];
  globalThis.caches = { default: cache };
  try {
    await run({ cache, settle: () => Promise.all(pending), waitUntil: (promise) => pending.push(promise) });
  } finally {
    if (realCaches === undefined) delete globalThis.caches; else globalThis.caches = realCaches;
  }
}

test('cacheable accepts only successful shareable responses', () => {
  assert.equal(cacheable(200, 'public, s-maxage=3600'), true);
  assert.equal(cacheable(301, 'public, s-maxage=3600'), true);
  assert.equal(cacheable(404, 'public, s-maxage=3600'), false);
  assert.equal(cacheable(200, 'no-store'), false);
});

test('public routes share an entry across tracking parameters', async () => {
  await withCache(async ({ settle, waitUntil }) => {
    let renders = 0;
    const render = () => {
      renders += 1;
      return Promise.resolve(new Response('profile', { headers: { 'Cache-Control': 'public, s-maxage=3600' } }));
    };

    const first = await cachePage(new Request('https://app.theplot.tv/u/example?utm_source=search'), render, waitUntil);
    await settle();
    const second = await cachePage(new Request('https://app.theplot.tv/u/example?fbclid=ignored'), render, waitUntil);

    assert.equal(first.headers.get('x-plot-cache'), 'miss');
    assert.equal(second.headers.get('x-plot-cache'), 'hit');
    assert.equal(await second.text(), 'profile');
    assert.equal(renders, 1);
  });
});

test('public route failures are not stored', async () => {
  await withCache(async ({ cache, settle, waitUntil }) => {
    const render = () => Promise.resolve(new Response('not found', { status: 404, headers: { 'Cache-Control': 'no-store' } }));
    await cachePage(new Request('https://app.theplot.tv/u/missing'), render, waitUntil);
    await settle();
    assert.equal(cache.store.size, 0);
  });
});
