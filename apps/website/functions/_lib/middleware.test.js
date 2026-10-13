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

test('moves /plans and /plans.html to /pricing, keeping the query', async () => {
  for (const path of ['/plans', '/plans.html']) {
    const res = await onRequest(ctx(`https://theplot.tv${path}?utm_source=x`));
    assert.equal(res.status, 301, path);
    const loc = new URL(res.headers.get('location'));
    assert.equal(loc.pathname, '/pricing', path);
    assert.equal(loc.search, '?utm_source=x', path);
  }
});

test('serves /pricing', async () => {
  const res = await onRequest(ctx('https://theplot.tv/pricing'));
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

test('admin host returns 410 for the retired desk', async () => {
  const res = await onRequest(ctx('https://admin.theplot.tv/'));
  assert.equal(res.status, 410);
  assert.equal(await res.text(), 'This page has been removed.');
  assert.equal(res.headers.get('X-Robots-Tag'), 'noindex, nofollow');
  assert.match(res.headers.get('Content-Type') || '', /text\/plain/);
});
