import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { EMPTY_STATE, MIN_POSTERS, UNAVAILABLE, classifyWhatsOn } from '../lib/whatsOnHealth.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const readFromRoot = (path) => readFile(join(root, path), 'utf8');
const poster = (n) => Array.from({ length: n }, (_, i) => `<img src="https://image.tmdb.org/t/p/w342/p${i}.jpg">`).join('');

test('a front page with posters is healthy', () => {
  assert.deepEqual(classifyWhatsOn(200, `<main>${poster(25)}</main>`), { ok: true, reason: '25 posters', posters: 25 });
});

test('the cached empty state from 2026-11-06 is broken even though it is a 200', () => {
  const v = classifyWhatsOn(200, `<p>${EMPTY_STATE}</p>`);
  assert.equal(v.ok, false);
  assert.match(v.reason, /empty state/);
});

test('the 503 unavailable page is broken', () => {
  const v = classifyWhatsOn(503, `<p>What's On is ${UNAVAILABLE}. Please try again in a moment.</p>`);
  assert.equal(v.ok, false);
  assert.match(v.reason, /HTTP 503 \(the "briefly unavailable" page\)/);
});

test('a 200 with too few posters is broken', () => {
  const v = classifyWhatsOn(200, poster(MIN_POSTERS - 1));
  assert.equal(v.ok, false);
  assert.match(v.reason, /expected at least/);
});

test('any other status is broken', () => {
  assert.equal(classifyWhatsOn(500, poster(25)).ok, false);
  assert.equal(classifyWhatsOn(404, '').ok, false);
});

// The check matches page text it does not own. If either page rewords it, the
// check would silently stop recognising that failure, so pin it to the source.
test('the matched strings still exist in the pages that render them', async () => {
  const [feed, proxy] = await Promise.all([
    readFromRoot('supabase/functions/marketing-feed/index.ts'),
    readFromRoot('apps/website/functions/_lib/whats-on.js'),
  ]);
  assert.ok(feed.includes(EMPTY_STATE), 'marketing-feed no longer renders the empty-state text');
  assert.ok(feed.includes(UNAVAILABLE), 'marketing-feed no longer renders the unavailable text');
  assert.ok(proxy.includes(UNAVAILABLE), 'the Pages proxy fallback no longer says "briefly unavailable"');
});
