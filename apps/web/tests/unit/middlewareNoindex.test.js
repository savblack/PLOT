import assert from 'node:assert/strict';
import test from 'node:test';

// The middleware runs on the `plot` Pages project, which serves production
// (app.theplot.tv) and a preview deployment per branch (*.plot-5wr.pages.dev).
// It decides noindex by asking whether the host IS production, so a mistake in
// that condition would deindex the real site silently. That is the case worth
// pinning down; the rest of the middleware (CSP nonce) is not what this covers.
//
// HTMLRewriter is a Cloudflare runtime global with no Node equivalent, so the
// HTML path gets a pass-through stub. The non-HTML path returns before it.
globalThis.HTMLRewriter = class {
  on() { return this; }
  transform(response) { return response; }
};

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

test('the CSP nonce header is still set on html regardless of host', async () => {
  const res = await call('https://app.theplot.tv/home', HTML);
  const csp = res.headers.get('Content-Security-Policy');
  assert.match(csp, /nonce-/);
  assert.equal(res.headers.get('Cache-Control'), 'no-store');
});

test('the CSP permits the curated Australian Guide logo hosts', async () => {
  const res = await call('https://app.theplot.tv/guide', HTML);
  const csp = res.headers.get('Content-Security-Policy');
  for (const host of ['10.com.au', '10play.com.au', 'cdn.iview.abc.net.au', 'i.mjh.nz', 'image.pr.sbsod.com', 'imageresizer.static9.net.au']) {
    assert.match(csp, new RegExp(`https://${host.replaceAll('.', '\\.')}(?:[ ;]|$)`), host);
  }
});
