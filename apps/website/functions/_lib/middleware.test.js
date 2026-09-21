import assert from 'node:assert/strict';
import test from 'node:test';
import { onRequest } from '../_middleware.js';

function ctx(url, { env = {}, next } = {}) {
  return {
    request: new Request(url),
    env,
    next: next || (async () => new Response('ok', { status: 200 })),
  };
}

test('gates /plans and /plans.html while pricing is hidden', async () => {
  for (const path of ['/plans', '/plans.html']) {
    const res = await onRequest(ctx(`https://theplot.tv${path}`));
    assert.equal(res.status, 302, path);
    assert.equal(new URL(res.headers.get('location')).pathname, '/');
  }
});

test('serves /plans when SHOW_PRICING_PAGE is enabled', async () => {
  const res = await onRequest(ctx('https://theplot.tv/plans', {
    env: { SHOW_PRICING_PAGE: 'true' },
  }));
  assert.equal(res.status, 200);
  assert.equal(await res.text(), 'ok');
});

test('collapses /whats-on/ onto /whats-on', async () => {
  const res = await onRequest(ctx('https://theplot.tv/whats-on/?utm_source=x'));
  assert.equal(res.status, 301);
  const loc = new URL(res.headers.get('location'));
  assert.equal(loc.pathname, '/whats-on');
  assert.equal(loc.search, '?utm_source=x');
});

test('admin host serves a disallow-all robots.txt', async () => {
  const res = await onRequest(ctx('https://admin.theplot.tv/robots.txt'));
  assert.equal(res.status, 200);
  assert.match(await res.text(), /Disallow: \//);
  assert.equal(res.headers.get('X-Robots-Tag'), 'noindex, nofollow');
});
