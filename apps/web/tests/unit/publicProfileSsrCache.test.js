import assert from 'node:assert/strict';
import { test } from 'node:test';
import { onRequest as publicProfile } from '../../../../functions/u/[username].js';

function fakeCache() {
  const store = new Map();
  return {
    async match(request) { const hit = store.get(request.url); return hit ? hit.clone() : undefined; },
    async put(request, response) { store.set(request.url, response); },
  };
}

test('a repeated public profile SSR request does not call Supabase again', async () => {
  const realFetch = globalThis.fetch;
  const realCaches = globalThis.caches;
  const calls = [];
  const pending = [];
  globalThis.caches = { default: fakeCache() };
  globalThis.fetch = async (input) => {
    const url = String(input);
    calls.push(url);
    if (url === 'https://app.theplot.tv/index.html') {
      return new Response('<!doctype html><html><head><title>plot</title></head><body><div id="root"></div></body></html>');
    }
    if (url.endsWith('/rpc/get_profile_card')) {
      return Response.json([{ id: 'profile-cache-user', is_public: true, username: 'profile-cache-test', display_name: 'Profile Cache Test', profile_sections: null }]);
    }
    if (url.endsWith('/rpc/get_follow_counts')) return Response.json([{ followers: 2 }]);
    if (url.includes('/history?') && url.includes('select=rating')) return Response.json([]);
    if (url.includes('/history?')) return new Response('[]', { headers: { 'content-range': '0-0/3' } });
    if (url.includes('/user_top_lists?')) return Response.json([]);
    throw new Error(`Unexpected request: ${url}`);
  };

  const context = (search = '') => ({
    request: new Request(`https://app.theplot.tv/u/profile-cache-test${search}`),
    params: { username: 'profile-cache-test' },
    waitUntil: (promise) => pending.push(promise),
  });

  try {
    const first = await publicProfile(context('?utm_source=search'));
    await Promise.all(pending);
    const afterFirst = calls.length;
    const second = await publicProfile(context('?fbclid=ignored'));

    assert.equal(first.headers.get('x-plot-cache'), 'miss');
    assert.equal(second.headers.get('x-plot-cache'), 'hit');
    assert.equal(calls.length, afterFirst, 'cache hit must skip the SSR route and all Supabase calls');
    assert.match(await second.text(), /Profile Cache Test/);
  } finally {
    globalThis.fetch = realFetch;
    if (realCaches === undefined) delete globalThis.caches; else globalThis.caches = realCaches;
  }
});
