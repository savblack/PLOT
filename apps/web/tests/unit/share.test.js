import assert from 'node:assert/strict';
import test from 'node:test';
import { buildTitleShareUrl, shareUrl } from '../../src/utils/share.js';

const ORIGIN = 'https://app.theplot.tv';

test('buildTitleShareUrl builds a /save deep link with normalised type', () => {
  assert.equal(
    buildTitleShareUrl({ tmdbId: 12345, mediaType: 'movie', origin: ORIGIN }),
    'https://app.theplot.tv/save?media_type=movie&tmdb_id=12345&src=share',
  );
  // 'show' / 'series' normalise to 'tv'
  assert.equal(
    buildTitleShareUrl({ tmdbId: 9, mediaType: 'show', source: 'panel', origin: ORIGIN }),
    'https://app.theplot.tv/save?media_type=tv&tmdb_id=9&src=panel',
  );
});

test('buildTitleShareUrl omits the src param when source is falsy', () => {
  assert.equal(
    buildTitleShareUrl({ tmdbId: 7, mediaType: 'movie', source: '', origin: ORIGIN }),
    'https://app.theplot.tv/save?media_type=movie&tmdb_id=7',
  );
});

test('buildTitleShareUrl returns null for invalid input', () => {
  assert.equal(buildTitleShareUrl({ tmdbId: 'abc', mediaType: 'movie', origin: ORIGIN }), null);
  assert.equal(buildTitleShareUrl({ tmdbId: 0, mediaType: 'movie', origin: ORIGIN }), null);
  assert.equal(buildTitleShareUrl({ tmdbId: 5, mediaType: 'book', origin: ORIGIN }), null);
});

test('buildTitleShareUrl returns null when no origin is available', () => {
  // No DOM in node, and no explicit origin passed.
  assert.equal(buildTitleShareUrl({ tmdbId: 5, mediaType: 'movie' }), null);
});

// --- shareUrl: native share / clipboard fallback ---------------------------

function withNavigator(stub, fn) {
  const had = Object.prototype.hasOwnProperty.call(globalThis, 'navigator');
  const prev = globalThis.navigator;
  // navigator is a getter-only global in some runtimes; redefine it.
  Object.defineProperty(globalThis, 'navigator', { value: stub, configurable: true, writable: true });
  return (async () => {
    try { return await fn(); }
    finally {
      if (had) Object.defineProperty(globalThis, 'navigator', { value: prev, configurable: true, writable: true });
      else delete globalThis.navigator;
    }
  })();
}

test('shareUrl uses the native share sheet when available', async () => {
  const calls = [];
  const result = await withNavigator(
    { share: async (data) => { calls.push(data); } },
    () => shareUrl({ url: 'https://x/y', title: 'T', text: 'hi' }),
  );
  assert.deepEqual(result, { ok: true, method: 'share' });
  assert.deepEqual(calls, [{ url: 'https://x/y', title: 'T', text: 'hi' }]);
});

test('shareUrl reports cancellation without copying', async () => {
  let copied = false;
  const result = await withNavigator(
    {
      share: async () => { const e = new Error('dismissed'); e.name = 'AbortError'; throw e; },
      clipboard: { writeText: async () => { copied = true; } },
    },
    () => shareUrl({ url: 'https://x/y' }),
  );
  assert.deepEqual(result, { ok: false, method: 'share', cancelled: true });
  assert.equal(copied, false);
});

test('shareUrl falls back to the clipboard when share is unavailable', async () => {
  let written = null;
  const result = await withNavigator(
    { clipboard: { writeText: async (v) => { written = v; } } },
    () => shareUrl({ url: 'https://x/y' }),
  );
  assert.deepEqual(result, { ok: true, method: 'copy' });
  assert.equal(written, 'https://x/y');
});

test('shareUrl falls back to clipboard on a non-abort share error', async () => {
  let written = null;
  const result = await withNavigator(
    {
      share: async () => { const e = new Error('blocked'); e.name = 'NotAllowedError'; throw e; },
      clipboard: { writeText: async (v) => { written = v; } },
    },
    () => shareUrl({ url: 'https://x/y' }),
  );
  assert.deepEqual(result, { ok: true, method: 'copy' });
  assert.equal(written, 'https://x/y');
});

test('shareUrl reports unavailable when neither API exists', async () => {
  const result = await withNavigator({}, () => shareUrl({ url: 'https://x/y' }));
  assert.deepEqual(result, { ok: false, method: 'unavailable' });
});
