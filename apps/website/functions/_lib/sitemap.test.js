import { test } from 'node:test';
import assert from 'node:assert/strict';
import { sitemapPage } from './sitemap.js';

const SHAREABLE = 'public, s-maxage=86400, stale-while-revalidate=604800';
const XML = '<?xml version="1.0"?><urlset></urlset>';

function fakeCache() {
  const store = new Map();
  return {
    store,
    async match(req) { const hit = store.get(req.url); return hit ? hit.clone() : undefined; },
    async put(req, res) { store.set(req.url, res); },
  };
}

async function withCache(run, upstream = () => new Response(XML, { status: 200, headers: { 'cache-control': SHAREABLE } })) {
  const realFetch = globalThis.fetch;
  const realCaches = globalThis.caches;
  const cache = fakeCache();
  const calls = [];
  globalThis.caches = { default: cache };
  globalThis.fetch = (url) => { calls.push(String(url)); return Promise.resolve(upstream(calls.length)); };
  const pending = [];
  const get = (href, upstreamUrl = 'https://example.test/sitemap', method = 'GET') =>
    sitemapPage(new Request(href, { method }), upstreamUrl, (p) => pending.push(p));
  try {
    await run({ get, cache, calls, settle: () => Promise.all(pending) });
  } finally {
    globalThis.fetch = realFetch;
    if (realCaches === undefined) delete globalThis.caches; else globalThis.caches = realCaches;
  }
}

test('a second sitemap request skips the Edge Function', async () => {
  await withCache(async ({ get, calls, settle }) => {
    const first = await get('https://theplot.tv/sitemap-articles.xml');
    await settle();
    assert.equal(first.headers.get('x-plot-cache'), 'miss');
    const second = await get('https://theplot.tv/sitemap-articles.xml?utm_source=x');
    assert.equal(second.headers.get('x-plot-cache'), 'hit');
    assert.equal(await second.text(), XML);
    assert.equal(calls.length, 1);
  });
});

test('a sitemap keeps its one-day cache duration when the source is shorter-lived', async () => {
  await withCache(async ({ get }) => {
    const response = await get('https://theplot.tv/sitemap-articles.xml');
    assert.equal(response.headers.get('cache-control'), SHAREABLE);
  }, () => new Response(XML, { status: 200, headers: { 'cache-control': 'public, s-maxage=3600' } }));
});

test('an unsuccessful upstream sitemap is never shareable downstream', async () => {
  await withCache(async ({ get }) => {
    const response = await get('https://theplot.tv/sitemap-articles.xml');
    assert.equal(response.status, 503);
    assert.equal(response.headers.get('cache-control'), 'no-store');
  }, () => new Response('down', { status: 503, headers: { 'cache-control': SHAREABLE } }));
});

test('a fetch failure serves an empty urlset and caches nothing', async () => {
  const real = globalThis.fetch;
  const realCaches = globalThis.caches;
  const cache = fakeCache();
  globalThis.caches = { default: cache };
  globalThis.fetch = () => Promise.reject(new Error('network'));
  try {
    const res = await sitemapPage(new Request('https://theplot.tv/sitemap-articles.xml'), 'https://example.test/sitemap');
    assert.equal(res.status, 200);
    assert.match(await res.text(), /<urlset/);
    assert.equal(res.headers.get('cache-control'), 'no-store');
    assert.equal(cache.store.size, 0);
  } finally {
    globalThis.fetch = real;
    if (realCaches === undefined) delete globalThis.caches; else globalThis.caches = realCaches;
  }
});
