import assert from 'node:assert/strict';
import test from 'node:test';

// The middleware runs on the `plot` Pages project, which serves production
// (app.theplot.tv) and a preview deployment per branch (*.plot-5wr.pages.dev).
// It decides noindex by asking whether the host IS production, so a mistake in
// that condition would deindex the real site silently. That is the case worth
// pinning down, plus the shape of the CSP: no inline script allowance, ever.

import { readFileSync } from 'node:fs';
const { onRequest } = await import('../../../../functions/_middleware.js');

function call(url, contentType) {
  return onRequest({
    request: new Request(url),
    next: async () => new Response('<!doctype html><script>1</script>', {
      headers: { 'content-type': contentType },
    }),
  });
}

const HTML = 'text/html; charset=utf-8';
const JSON_CT = 'application/json';

test('production is never noindexed — html', async () => {
  const res = await call('https://app.theplot.tv/home', HTML);
  assert.equal(res.headers.get('X-Robots-Tag'), null);
});

test('production is never noindexed — non-html', async () => {
  const res = await call('https://app.theplot.tv/assets/index.js', JSON_CT);
  assert.equal(res.headers.get('X-Robots-Tag'), null);
});

test('a per-branch preview deployment is noindexed — html', async () => {
  const res = await call('https://0379f55a.plot-5wr.pages.dev/home', HTML);
  assert.equal(res.headers.get('X-Robots-Tag'), 'noindex, nofollow');
});

test('a per-branch preview deployment is noindexed — non-html', async () => {
  const res = await call('https://0379f55a.plot-5wr.pages.dev/api/thing', JSON_CT);
  assert.equal(res.headers.get('X-Robots-Tag'), 'noindex, nofollow');
});

test('any other host is treated as non-production', async () => {
  // preview.theplot.tv was the only named host before 2026-09-06. Nothing should
  // depend on that name again — an unrecognised host is noindexed by default.
  for (const host of ['preview.theplot.tv', 'plot-5wr.pages.dev', 'localhost:8788']) {
    const res = await call(`https://${host}/`, HTML);
    assert.equal(res.headers.get('X-Robots-Tag'), 'noindex, nofollow', host);
  }
});

test('the CSP is set on html and allows no inline script', async () => {
  // No nonce and no 'unsafe-inline': an escaping slip in a server-rendered
  // page must produce a blocked script, not a running one. The old nonce was
  // stamped onto every inline <script> in the response, injected ones included.
  const res = await call('https://app.theplot.tv/home', HTML);
  const csp = res.headers.get('Content-Security-Policy');
  const scriptSrc = csp.split(';').map((d) => d.trim()).find((d) => d.startsWith('script-src '));
  assert.ok(scriptSrc, 'script-src present');
  assert.doesNotMatch(scriptSrc, /nonce-|unsafe-inline|unsafe-eval|\*/);
  assert.match(scriptSrc, /'self'/);
});

test('the shell carries no inline script for the CSP to block', () => {
  // Everything that runs before React is a file under public/boot/.
  const html = readFileSync(new URL('../../index.html', import.meta.url), 'utf8');
  const inline = [...html.matchAll(/<script\b([^>]*)>/g)].filter(([, attrs]) => !/\bsrc=/.test(attrs));
  assert.deepEqual(inline, []);
  for (const file of ['startup-guard.js', 'theme.js']) {
    assert.match(html, new RegExp(`<script src="/boot/${file}"`), file);
  }
});

test('the CSP permits the curated Australian Guide logo hosts', async () => {
  const res = await call('https://app.theplot.tv/guide', HTML);
  const csp = res.headers.get('Content-Security-Policy');
  for (const host of ['10.com.au', '10play.com.au', 'cdn.iview.abc.net.au', 'i.mjh.nz', 'image.pr.sbsod.com', 'imageresizer.static9.net.au']) {
    assert.match(csp, new RegExp(`https://${host.replaceAll('.', '\\.')}(?:[ ;]|$)`), host);
  }
});
