import test from 'node:test';
import assert from 'node:assert/strict';
import { onRequest } from '../api/newsletter.js';

const request = (method = 'POST', ip = '192.0.2.1') => new Request('https://theplot.tv/api/newsletter?token=test', {
  method, headers: { ...(ip ? { 'CF-Connecting-IP': ip } : {}), 'x-forwarded-for': 'spoofed', 'content-type': 'application/json' },
  ...(method === 'POST' ? { body: JSON.stringify({ email: 'test@example.invalid' }) } : {}),
});

function upstream(t) {
  const calls = [];
  t.mock.method(globalThis, 'fetch', async (url, options) => {
    calls.push({ url: String(url), options });
    return Response.json({ ok: true });
  });
  return calls;
}

test('an admitted signup forwards once with the platform client address', async t => {
  const calls = upstream(t);
  const response = await onRequest({ request: request(), env: { NEWSLETTER_EDGE_LIMITER: {
    fetch: async req => {
      assert.equal(req.headers.get('x-plot-client-ip'), '192.0.2.1');
      assert.equal(req.headers.get('x-forwarded-for'), null);
      return Response.json({ allowed: true });
    },
  } } });
  assert.equal(response.status, 200);
  assert.equal(calls.length, 1);
  assert.match(calls[0].url, /newsletter-subscribe\?token=test$/);
  assert.equal(calls[0].options.headers.get('x-forwarded-for'), '192.0.2.1');
});

test('a blocked signup returns 429 without invoking Supabase', async t => {
  const calls = upstream(t);
  const response = await onRequest({ request: request(), env: { NEWSLETTER_EDGE_LIMITER: {
    fetch: async () => Response.json({ allowed: false }, { status: 429, headers: { 'retry-after': '577' } }),
  } } });
  assert.equal(response.status, 429);
  assert.equal(response.headers.get('retry-after'), '577');
  assert.equal(response.headers.get('cache-control'), 'no-store');
  assert.equal(calls.length, 0);
});

for (const mode of ['missing_binding', 'missing_ip', 'unavailable', 'invalid_response', 'rejected']) {
  test(`POST fails closed when admission is ${mode}`, async t => {
    const calls = upstream(t);
    const env = { NEWSLETTER_EDGE_LIMITER: { fetch: async () => {
      if (mode === 'rejected') throw new Error('Unavailable');
      if (mode === 'invalid_response') return Response.json({});
      return new Response(null, { status: 503 });
    } } };
    const response = await onRequest({ request: request('POST', mode === 'missing_ip' ? null : '192.0.2.1'), env: mode === 'missing_binding' ? {} : env });
    assert.equal(response.status, 503);
    assert.equal(calls.length, 0);
  });
}

for (const method of ['GET', 'HEAD', 'OPTIONS']) {
  test(`${method} unsubscribe and preflight handling bypasses signup admission`, async t => {
    const calls = upstream(t);
    const response = await onRequest({ request: request(method), env: {} });
    assert.equal(response.status, 200);
    assert.equal(calls.length, 1);
  });
}
