import { test } from 'node:test';
import assert from 'node:assert/strict';
import { titlePage } from './title.js';

// Captures the region this proxy asks the Edge Function for. The function reads
// ?r= and defaults to US, so whatever lands here is what the reader sees.
const upstreamRegion = async (href, cf) => {
  const real = globalThis.fetch;
  let asked = null;
  globalThis.fetch = (url) => {
    asked = new URL(url).searchParams.get('r');
    return Promise.resolve(new Response('<!doctype html>', { status: 200 }));
  };
  try {
    await titlePage(Object.assign(new Request(href), { cf }), 'movie', 'carnage-72113');
  } finally {
    globalThis.fetch = real;
  }
  return asked;
};

test('geo decides when the reader asks for nothing', async () => {
  assert.equal(await upstreamRegion('https://theplot.tv/movie/carnage-72113', { country: 'AU' }), 'AU');
});

// This is the bug the region control could not be built around: the proxy used
// to compose ?r= from request.cf alone and drop anything the visitor asked for,
// so every link to another region silently returned the same page.
test('a requested region wins over geo', async () => {
  assert.equal(await upstreamRegion('https://theplot.tv/movie/carnage-72113?r=GB', { country: 'AU' }), 'GB');
});

test('a requested region is normalised to upper case', async () => {
  assert.equal(await upstreamRegion('https://theplot.tv/movie/carnage-72113?r=gb', { country: 'AU' }), 'GB');
});

test('junk in ?r= falls back to geo rather than through to TMDB', async () => {
  assert.equal(await upstreamRegion('https://theplot.tv/movie/carnage-72113?r=zzzz', { country: 'AU' }), 'AU');
  assert.equal(await upstreamRegion('https://theplot.tv/movie/carnage-72113?r=1', { country: 'AU' }), 'AU');
});

test('no region at all is left for the function to default', async () => {
  assert.equal(await upstreamRegion('https://theplot.tv/movie/carnage-72113', {}), null);
});

test('a requested region still works when geo is missing', async () => {
  assert.equal(await upstreamRegion('https://theplot.tv/movie/carnage-72113?r=NZ', {}), 'NZ');
});

// ── Caching ────────────────────────────────────────────────────────────────
// Cloudflare does not cache Pages Function responses by itself, so without this
// every bot hit was a Supabase invocation, a TMDB lookup and ~14 KB of egress.
// The page depends on the reader's region, so that is part of the key.

import { cacheable } from './title.js';

const SHAREABLE = 'public, s-maxage=86400, stale-while-revalidate=604800';

// A Map-backed stand-in for caches.default, keyed the way the real one is: by URL.
function fakeCache() {
  const store = new Map();
  return {
    store,
    async match(req) { const hit = store.get(req.url); return hit ? hit.clone() : undefined; },
    async put(req, res) { store.set(req.url, res); },
  };
}

// Runs titlePage against a fake upstream and cache. `upstream` is a function of
// the call count so a test can change what the Edge Function answers.
async function withCache(run, upstream = () => new Response('<!doctype html>page', { status: 200, headers: { 'cache-control': SHAREABLE } })) {
  const realFetch = globalThis.fetch;
  const realCaches = globalThis.caches;
  const cache = fakeCache();
  const calls = [];
  globalThis.caches = { default: cache };
  globalThis.fetch = (url) => { calls.push(new URL(url)); return Promise.resolve(upstream(calls.length)); };
  const pending = [];
  const get = (href, cf = { country: 'AU' }, slug = 'carnage-72113', type = 'movie', method = 'GET') =>
    titlePage(Object.assign(new Request(href, { method }), { cf }), type, slug, (p) => pending.push(p));
  try {
    await run({ get, cache, calls, settle: () => Promise.all(pending) });
  } finally {
    globalThis.fetch = realFetch;
    if (realCaches === undefined) delete globalThis.caches; else globalThis.caches = realCaches;
  }
}

test('cacheable: only pages and canonical redirects the function marked shareable', () => {
  assert.equal(cacheable(200, SHAREABLE), true);
  assert.equal(cacheable(301, 'public, s-maxage=86400'), true);
  // Errors and misses are never kept, however they are labelled.
  for (const status of [302, 404, 429, 500, 502, 503]) assert.equal(cacheable(status, SHAREABLE), false, String(status));
  // Nothing says it may be shared, or it says not to.
  assert.equal(cacheable(200, null), false);
  assert.equal(cacheable(200, 'no-store'), false);
  assert.equal(cacheable(200, 'public, max-age=300'), false);
  assert.equal(cacheable(200, 'public, s-maxage=0'), false);
});

test('a second request for the same title and region is served without calling the function', async () => {
  await withCache(async ({ get, calls, settle }) => {
    const first = await get('https://theplot.tv/movie/carnage-72113');
    await settle();
    assert.equal(first.headers.get('x-plot-cache'), 'miss');
    const second = await get('https://theplot.tv/movie/carnage-72113');
    assert.equal(second.headers.get('x-plot-cache'), 'hit');
    assert.equal(await second.text(), '<!doctype html>page');
    assert.equal(second.headers.get('content-type'), 'text/html; charset=utf-8');
    assert.equal(calls.length, 1, 'the function was called once');
  });
});

// The reason the key carries the region: the page is region-specific, and the
// URL is the same for everyone.
test('a different region never shares an entry', async () => {
  await withCache(async ({ get, calls, settle }) => {
    await get('https://theplot.tv/movie/carnage-72113', { country: 'AU' });
    await settle();
    const us = await get('https://theplot.tv/movie/carnage-72113', { country: 'US' });
    assert.equal(us.headers.get('x-plot-cache'), 'miss');
    assert.equal(calls.length, 2);
    assert.equal(calls[1].searchParams.get('r'), 'US');
    await settle();
    // And each one is then served from its own entry.
    assert.equal((await get('https://theplot.tv/movie/carnage-72113', { country: 'AU' })).headers.get('x-plot-cache'), 'hit');
    assert.equal((await get('https://theplot.tv/movie/carnage-72113', { country: 'US' })).headers.get('x-plot-cache'), 'hit');
    assert.equal(calls.length, 2);
  });
});

test('an explicit ?r= shares the entry of the same region reached by geo', async () => {
  await withCache(async ({ get, calls, settle }) => {
    await get('https://theplot.tv/movie/carnage-72113', { country: 'GB' });
    await settle();
    const asked = await get('https://theplot.tv/movie/carnage-72113?r=gb', { country: 'AU' });
    assert.equal(asked.headers.get('x-plot-cache'), 'hit');
    assert.equal(calls.length, 1);
  });
});

test('tracking parameters and junk share one entry instead of each costing a call', async () => {
  await withCache(async ({ get, calls, settle }) => {
    await get('https://theplot.tv/movie/carnage-72113');
    await settle();
    for (const q of ['?utm_source=x', '?fbclid=abc&utm_medium=y', '?r=zzzz', '?']) {
      const res = await get(`https://theplot.tv/movie/carnage-72113${q}`);
      assert.equal(res.headers.get('x-plot-cache'), 'hit', q);
    }
    assert.equal(calls.length, 1);
  });
});

test('a movie and a show with the same slug are separate entries', async () => {
  await withCache(async ({ get, calls, settle }) => {
    await get('https://theplot.tv/movie/x-1', { country: 'AU' }, 'x-1', 'movie');
    await settle();
    assert.equal((await get('https://theplot.tv/tv/x-1', { country: 'AU' }, 'x-1', 'tv')).headers.get('x-plot-cache'), 'miss');
    assert.equal(calls.length, 2);
  });
});

test('errors, misses and unmarked pages are not kept', async () => {
  for (const make of [
    () => new Response('nope', { status: 404, headers: { 'cache-control': SHAREABLE } }),
    () => new Response('down', { status: 503, headers: { 'cache-control': SHAREABLE } }),
    () => new Response('page', { status: 200, headers: { 'cache-control': 'no-store' } }),
    () => new Response('page', { status: 200, headers: { 'cache-control': 'public, max-age=300' } }),
  ]) {
    await withCache(async ({ get, cache, calls, settle }) => {
      await get('https://theplot.tv/movie/carnage-72113');
      await settle();
      assert.equal(cache.store.size, 0);
      await get('https://theplot.tv/movie/carnage-72113');
      assert.equal(calls.length, 2, 'the next reader still reaches the function');
    }, make);
  }
});

test('an unsuccessful upstream page is never shareable downstream', async () => {
  await withCache(async ({ get }) => {
    const response = await get('https://theplot.tv/movie/carnage-72113');
    assert.equal(response.status, 503);
    assert.equal(response.headers.get('cache-control'), 'no-store');
  }, () => new Response('down', { status: 503, headers: { 'cache-control': SHAREABLE } }));
});

test('a fetch failure returns the fallback page and caches nothing', async () => {
  const real = globalThis.fetch;
  const realCaches = globalThis.caches;
  const cache = fakeCache();
  globalThis.caches = { default: cache };
  globalThis.fetch = () => Promise.reject(new Error('network'));
  try {
    const res = await titlePage(Object.assign(new Request('https://theplot.tv/movie/carnage-72113'), { cf: { country: 'AU' } }), 'movie', 'carnage-72113');
    assert.equal(res.status, 502);
    assert.equal(cache.store.size, 0);
  } finally {
    globalThis.fetch = real;
    if (realCaches === undefined) delete globalThis.caches; else globalThis.caches = realCaches;
  }
});

test('the canonical redirect is kept too, with its Location', async () => {
  const redirect = () => new Response(null, { status: 301, headers: { location: 'https://theplot.tv/movie/carnage-72113', 'cache-control': 'public, s-maxage=86400' } });
  await withCache(async ({ get, calls, settle }) => {
    const first = await get('https://theplot.tv/movie/72113', { country: 'AU' }, '72113');
    await settle();
    assert.equal(first.status, 301);
    const again = await get('https://theplot.tv/movie/72113', { country: 'AU' }, '72113');
    assert.equal(again.status, 301);
    assert.equal(again.headers.get('location'), 'https://theplot.tv/movie/carnage-72113');
    assert.equal(again.headers.get('x-plot-cache'), 'hit');
    assert.equal(calls.length, 1);
  }, redirect);
});

test('HEAD can be served from the cache but never fills it', async () => {
  await withCache(async ({ get, cache, calls, settle }) => {
    await get('https://theplot.tv/movie/carnage-72113', { country: 'AU' }, 'carnage-72113', 'movie', 'HEAD');
    await settle();
    assert.equal(cache.store.size, 0);
    await get('https://theplot.tv/movie/carnage-72113');
    await settle();
    const head = await get('https://theplot.tv/movie/carnage-72113', { country: 'AU' }, 'carnage-72113', 'movie', 'HEAD');
    assert.equal(head.headers.get('x-plot-cache'), 'hit');
    assert.equal(calls.length, 2);
  });
});

test('a failing cache never breaks a page', async () => {
  const realFetch = globalThis.fetch;
  const realCaches = globalThis.caches;
  globalThis.caches = { default: { match: () => Promise.reject(new Error('cache down')), put: () => Promise.reject(new Error('cache down')) } };
  globalThis.fetch = () => Promise.resolve(new Response('<!doctype html>page', { status: 200, headers: { 'cache-control': SHAREABLE } }));
  try {
    const res = await titlePage(Object.assign(new Request('https://theplot.tv/movie/carnage-72113'), { cf: { country: 'AU' } }), 'movie', 'carnage-72113');
    assert.equal(res.status, 200);
    assert.equal(await res.text(), '<!doctype html>page');
  } finally {
    globalThis.fetch = realFetch;
    if (realCaches === undefined) delete globalThis.caches; else globalThis.caches = realCaches;
  }
});

test('with no Cache API (local node) it still serves, uncached', async () => {
  const realFetch = globalThis.fetch;
  const realCaches = globalThis.caches;
  delete globalThis.caches;
  let calls = 0;
  globalThis.fetch = () => { calls++; return Promise.resolve(new Response('page', { status: 200, headers: { 'cache-control': SHAREABLE } })); };
  try {
    const get = () => titlePage(Object.assign(new Request('https://theplot.tv/movie/carnage-72113'), { cf: { country: 'AU' } }), 'movie', 'carnage-72113');
    assert.equal((await get()).headers.get('x-plot-cache'), 'miss');
    await get();
    assert.equal(calls, 2);
  } finally {
    globalThis.fetch = realFetch;
    if (realCaches !== undefined) globalThis.caches = realCaches;
  }
});
