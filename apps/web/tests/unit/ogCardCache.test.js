import assert from 'node:assert/strict';
import { test } from 'node:test';
import { onRequest, CARD_VERSION } from '../../../../functions/og.js';

test('a failed render is not cached and the next request recovers', async t => {
  const store = new Map();
  const keys = [];
  t.mock.method(globalThis, 'fetch', async url => {
    if (!String(url).includes('/functions/v1/og-card')) return new Response('static card');
    attempts += 1;
    return attempts === 1
      ? new Response('temporary failure', { status: 503, headers: { 'cache-control': 'no-store' } })
      : new Response('recovered card', { headers: { 'content-type': 'image/jpeg', 'cache-control': 'public, s-maxage=604800' } });
  });
  const oldCaches = globalThis.caches;
  globalThis.caches = { default: {
    async match(key) { keys.push(key.url); return store.get(key.url)?.clone(); },
    async put(key, response) { store.set(key.url, response); },
  } };
  t.after(() => { if (oldCaches === undefined) delete globalThis.caches; else globalThis.caches = oldCaches; });
  let attempts = 0;
  const pending = [];
  const request = new Request('https://app.theplot.tv/og?u=example&utm_source=ignored');
  const context = { request, waitUntil: p => pending.push(p) };
  const failed = await onRequest(context);
  await Promise.all(pending);
  assert.equal(failed.headers.get('x-plot-card'), 'fallback');
  assert.equal(failed.headers.get('cache-control'), 'no-store');
  assert.equal(store.size, 0);
  const recovered = await onRequest(context);
  await Promise.all(pending);
  assert.equal(await recovered.text(), 'recovered card');
  assert.equal(store.size, 1);
  const cached = await onRequest(context);
  assert.equal(cached.headers.get('x-plot-cache'), 'hit');
  assert.equal(attempts, 2);
  assert.equal(new URL(keys[0]).searchParams.get('v'), String(CARD_VERSION));
  assert.equal(new URL(keys[0]).searchParams.has('utm_source'), false);
});
