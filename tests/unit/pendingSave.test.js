import assert from 'node:assert/strict';
import test from 'node:test';
import {
  normalizePendingSave,
  writePendingSave,
  readPendingSave,
  clearPendingSave,
} from '../../src/utils/pendingSave.js';

function withFakeStorage(fn) {
  const store = new Map();
  globalThis.window = {
    localStorage: {
      getItem: k => (store.has(k) ? store.get(k) : null),
      setItem: (k, v) => { store.set(k, String(v)); },
      removeItem: k => { store.delete(k); },
    },
  };
  globalThis.document = {};
  try { return fn(store); }
  finally { delete globalThis.window; delete globalThis.document; }
}

test('normalizePendingSave accepts valid movie/tv intents and coerces the id', () => {
  assert.deepEqual(normalizePendingSave({ tmdb_id: '12345', media_type: 'movie' }), { tmdb_id: 12345, media_type: 'movie' });
  assert.deepEqual(normalizePendingSave({ tmdb_id: 7, media_type: 'show' }), { tmdb_id: 7, media_type: 'tv' });
});

test('normalizePendingSave keeps a sanitised source and drops an empty/garbage one', () => {
  assert.deepEqual(normalizePendingSave({ tmdb_id: 1, media_type: 'movie', source: 'Chart' }), { tmdb_id: 1, media_type: 'movie', source: 'chart' });
  assert.deepEqual(normalizePendingSave({ tmdb_id: 1, media_type: 'movie', source: 'news letter!' }), { tmdb_id: 1, media_type: 'movie', source: 'newsletter' });
  // No source key at all when it sanitises to empty.
  assert.deepEqual(normalizePendingSave({ tmdb_id: 1, media_type: 'movie', source: '!!!' }), { tmdb_id: 1, media_type: 'movie' });
});

test('normalizePendingSave rejects bad ids and unknown media types', () => {
  assert.equal(normalizePendingSave({ tmdb_id: 'abc', media_type: 'movie' }), null);
  assert.equal(normalizePendingSave({ tmdb_id: 0, media_type: 'movie' }), null);
  assert.equal(normalizePendingSave({ tmdb_id: -3, media_type: 'movie' }), null);
  assert.equal(normalizePendingSave({ tmdb_id: 12, media_type: 'banana' }), null);
  assert.equal(normalizePendingSave({}), null);
});

test('write then read round-trips a valid intent', () => {
  withFakeStorage(() => {
    const written = writePendingSave({ tmdb_id: '500', media_type: 'tv' });
    assert.deepEqual(written, { tmdb_id: 500, media_type: 'tv' });
    assert.deepEqual(readPendingSave(), { tmdb_id: 500, media_type: 'tv' });
  });
});

test('writePendingSave does not persist invalid intents', () => {
  withFakeStorage((store) => {
    assert.equal(writePendingSave({ tmdb_id: 'x', media_type: 'movie' }), null);
    assert.equal(store.size, 0);
  });
});

test('readPendingSave clears and ignores expired intents', () => {
  withFakeStorage((store) => {
    // Hand-craft a stale entry (older than the 24h TTL).
    const stale = JSON.stringify({ tmdb_id: 9, media_type: 'movie', ts: Date.now() - (25 * 60 * 60 * 1000) });
    store.set('plot_pending_save', stale);
    assert.equal(readPendingSave(), null);
    assert.equal(store.size, 0, 'expired entry should be cleared');
  });
});

test('clearPendingSave removes a stored intent', () => {
  withFakeStorage((store) => {
    writePendingSave({ tmdb_id: 1, media_type: 'movie' });
    assert.equal(store.size, 1);
    clearPendingSave();
    assert.equal(store.size, 0);
  });
});
