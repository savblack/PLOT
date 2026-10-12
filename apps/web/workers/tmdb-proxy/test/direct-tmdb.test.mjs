import assert from 'node:assert/strict';
import test from 'node:test';
import handler from '../src/index.js';
import { fetchTMDB } from '../src/tmdb.js';

test('serves preflight at Cloudflare without calling Supabase or the limiter', async () => {
  const response = await handler.fetch(new Request('https://proxy.example/?path=genre/movie/list', {
    method: 'OPTIONS',
    headers: { Origin: 'https://app.theplot.tv' },
  }), { RL: { limit: () => { throw new Error('rate limit called'); } } }, {});
  assert.equal(response.status, 200);
  assert.equal(response.headers.get('Access-Control-Allow-Origin'), 'https://app.theplot.tv');
  assert.match(response.headers.get('Access-Control-Allow-Headers'), /authorization/);
});

test('rejects an unapproved TMDB path before reaching TMDB', async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = () => { throw new Error('unexpected fetch'); };
  try {
    const response = await fetchTMDB(new URL('https://proxy.example/?path=account'), 'server-key', null);
    assert.equal(response.status, 403);
    assert.deepEqual(await response.json(), { error: 'TMDB path not allowed' });
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('uses the Worker secret for TMDB and keeps client-supplied api_key out', async () => {
  const originalFetch = globalThis.fetch;
  const originalCaches = globalThis.caches;
  let fetchedUrl;
  globalThis.fetch = async (url) => {
    fetchedUrl = new URL(url);
    return Response.json({ genres: [] });
  };
  globalThis.caches = { default: { match: async () => null, put: async () => {} } };
  try {
    const response = await handler.fetch(new Request(
      'https://proxy.example/?path=genre%2Fmovie%2Flist&language=en-US&api_key=client-key',
      { headers: { Origin: 'https://app.theplot.tv', 'CF-Connecting-IP': '127.0.0.1' } },
    ), {
      TMDB_API_KEY: 'server-key',
      RL: { limit: async () => ({ success: true }) },
    }, { waitUntil() {} });
    assert.equal(fetchedUrl.origin, 'https://api.themoviedb.org');
    assert.equal(fetchedUrl.pathname, '/3/genre/movie/list');
    assert.equal(fetchedUrl.searchParams.get('api_key'), 'server-key');
    assert.equal(fetchedUrl.searchParams.get('language'), 'en-US');
    assert.equal(response.headers.get('X-Plot-Backend'), 'tmdb');
    assert.equal(response.headers.get('Access-Control-Allow-Origin'), 'https://app.theplot.tv');
    assert.deepEqual(await response.json(), { genres: [] });
  } finally {
    globalThis.fetch = originalFetch;
    globalThis.caches = originalCaches;
  }
});

test('supports a TMDB read token without putting it in the URL', async () => {
  const originalFetch = globalThis.fetch;
  let requestedUrl;
  let authorization;
  globalThis.fetch = async (url, init) => {
    requestedUrl = new URL(url);
    authorization = init.headers.Authorization;
    return Response.json({ genres: [] });
  };
  try {
    const response = await fetchTMDB(new URL('https://proxy.example/?path=genre/movie/list'), 'eyJ-test-token', null);
    assert.equal(response.status, 200);
    assert.equal(requestedUrl.searchParams.has('api_key'), false);
    assert.equal(authorization, 'Bearer eyJ-test-token');
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('keeps the existing Supabase path available when the Worker key is absent', async () => {
  const originalFetch = globalThis.fetch;
  const originalCaches = globalThis.caches;
  let requestedUrl;
  let proxySecret;
  globalThis.fetch = async (url, init) => {
    requestedUrl = String(url);
    proxySecret = init.headers.get('X-PLOT-TMDB-Proxy-Secret');
    return Response.json({ genres: [] });
  };
  globalThis.caches = { default: { match: async () => null, put: async () => {} } };
  try {
    const response = await handler.fetch(new Request('https://proxy.example/?path=genre/movie/list', {
      headers: { Origin: 'https://app.theplot.tv' },
    }), {
      UPSTREAM: 'https://example.supabase.co/functions/v1/tmdb-proxy',
      UPSTREAM_SHARED_SECRET: 'test-secret',
      RL: { limit: async () => ({ success: true }) },
    }, { waitUntil() {} });
    assert.match(requestedUrl, /^https:\/\/example\.supabase\.co\/functions\/v1\/tmdb-proxy\?/);
    assert.equal(proxySecret, 'test-secret');
    assert.equal(response.headers.get('X-Plot-Backend'), 'supabase');
  } finally {
    globalThis.fetch = originalFetch;
    globalThis.caches = originalCaches;
  }
});
