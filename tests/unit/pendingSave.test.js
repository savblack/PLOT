import assert from 'node:assert/strict';
import test from 'node:test';
import {
  normalizePendingSave,
  writePendingSave,
  readPendingSave,
  clearPendingSave,
} from '../../src/utils/pendingSave.js';
import { drainPendingSave } from '../../src/utils/drainPendingSave.js';
import { fetchFromTMDBResolved } from '../../src/core/tmdb.js';
import { configure } from '../../src/core/config.js';

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

/* ───────────────────────── drainPendingSave (deep-link processor) ───────────────────────── */

const EVENTS = { WATCHLIST_SAVED: 'watchlist_saved' };

// Build an injected-deps bag with recording spies and a scripted getDetails.
function makeDeps({ getDetails, isInList = () => false, addToList = async () => true } = {}) {
  const calls = { track: [], activated: [], opened: [], results: [], added: [] };
  return {
    deps: {
      getDetails,
      isInList,
      addToList: async (item) => { calls.added.push(item); return addToList(item); },
      openPanel: (id, mediaType) => calls.opened.push([id, mediaType]),
      track: (event, props) => calls.track.push([event, props]),
      markActivated: (name, props) => calls.activated.push([name, props]),
      EVENTS,
      onResult: (r) => calls.results.push(r),
    },
    calls,
  };
}

const okDetails = (data) => async () => ({ ok: true, data, retryable: false });

test('drainPendingSave: transient 429 → not terminal, intent preserved, no error toast', async () => {
  const { deps, calls } = makeDeps({
    getDetails: async () => ({ ok: false, data: null, retryable: true }),
  });
  const out = await drainPendingSave({ intent: { tmdb_id: 99, media_type: 'movie' } }, deps);
  assert.equal(out.terminal, false, 'transient failure must NOT be terminal');
  assert.equal(out.status, 'retry');
  assert.equal(calls.added.length, 0, 'nothing added on a transient failure');
  assert.equal(calls.results.length, 0, 'no scary error toast on a 429 — silent retry-later');
});

test('drainPendingSave: 429 then success (caller retries) → terminal success, saved + tracked', async () => {
  // First load: 429 (retryable, not terminal). Intent would be preserved.
  let attempt = 0;
  const getDetails = async () => {
    attempt += 1;
    return attempt === 1
      ? { ok: false, data: null, retryable: true }
      : { ok: true, data: { id: 603, title: 'The Matrix', genres: [{ id: 28 }] }, retryable: false };
  };
  const { deps, calls } = makeDeps({ getDetails });

  const first = await drainPendingSave({ intent: { tmdb_id: 603, media_type: 'movie' } }, deps);
  assert.equal(first.terminal, false, 'first pass (429) preserves the intent');

  const second = await drainPendingSave({ intent: { tmdb_id: 603, media_type: 'movie' } }, deps);
  assert.equal(second.terminal, true);
  assert.equal(second.status, 'success');
  assert.equal(calls.added.length, 1);
  assert.deepEqual(calls.added[0].genre_ids, [28], 'genres objects flattened to genre_ids');
  assert.equal(calls.track[0][0], EVENTS.WATCHLIST_SAVED);
  assert.equal(calls.track[0][1].already_saved, false);
  assert.equal(calls.activated.length, 1, 'a new save marks first_save activation');
  assert.deepEqual(calls.opened[0], [603, 'movie']);
  assert.equal(calls.results[0].status, 'success');
});

test('drainPendingSave: non-retryable (unknown id) → terminal error toast, nothing saved', async () => {
  const { deps, calls } = makeDeps({
    getDetails: async () => ({ ok: false, data: null, retryable: false }),
  });
  const out = await drainPendingSave({ intent: { tmdb_id: 1, media_type: 'movie' } }, deps);
  assert.equal(out.terminal, true, 'a definitively bad id is terminal (cleared by caller)');
  assert.equal(out.status, 'error');
  assert.equal(calls.added.length, 0);
  assert.equal(calls.results[0].status, 'error');
  assert.match(calls.results[0].message, /Couldn't save/);
});

test('drainPendingSave: already-saved → terminal success confirmation, no fetch, no add', async () => {
  let fetched = false;
  const { deps, calls } = makeDeps({
    isInList: () => true,
    getDetails: async () => { fetched = true; return { ok: true, data: {}, retryable: false }; },
  });
  const out = await drainPendingSave({ intent: { tmdb_id: 550, media_type: 'movie' } }, deps);
  assert.equal(out.terminal, true);
  assert.equal(out.status, 'already_saved');
  assert.equal(fetched, false, 'already-saved short-circuits before any proxy fetch');
  assert.equal(calls.added.length, 0);
  assert.equal(calls.track[0][1].already_saved, true);
  assert.equal(calls.activated.length, 0, 'already-saved is not a new activation');
  assert.equal(calls.results[0].status, 'success');
  assert.match(calls.results[0].message, /already on your watchlist/);
});

test('drainPendingSave: tv intent resolves via the tv path and uses name as title', async () => {
  const { deps, calls } = makeDeps({
    getDetails: async (mediaType) => {
      assert.equal(mediaType, 'tv');
      return { ok: true, data: { id: 1399, name: 'Game of Thrones' }, retryable: false };
    },
  });
  const out = await drainPendingSave({ intent: { tmdb_id: 1399, media_type: 'tv' } }, deps);
  assert.equal(out.status, 'success');
  assert.match(calls.results[0].message, /Game of Thrones/);
  assert.deepEqual(calls.added[0].genre_ids, [], 'no genres → empty genre_ids');
});

test('drainPendingSave: addToList fails with no transient signal → terminal error', async () => {
  const { deps, calls } = makeDeps({
    getDetails: okDetails({ id: 7, title: 'X' }),
    addToList: async () => false,
    isInList: () => false,
  });
  const out = await drainPendingSave({ intent: { tmdb_id: 7, media_type: 'movie' } }, deps);
  assert.equal(out.terminal, true);
  assert.equal(out.status, 'error');
  assert.equal(calls.results[0].status, 'error');
});

/* ───────────────────────── fetchFromTMDBResolved (proxy retry helper) ───────────────────────── */

function withFakeFetch(responses, fn) {
  const realFetch = globalThis.fetch;
  let i = 0;
  globalThis.fetch = async () => {
    const r = responses[Math.min(i, responses.length - 1)];
    i += 1;
    if (r instanceof Error) throw r;
    return {
      ok: r.status >= 200 && r.status < 300,
      status: r.status,
      json: async () => r.body ?? {},
    };
  };
  configure({ tmdbProxyUrl: 'https://proxy.test', supabaseAnonKey: 'anon' });
  return Promise.resolve(fn(() => i)).finally(() => { globalThis.fetch = realFetch; });
}

test('fetchFromTMDBResolved: 200 → ok with data, no retry', async () => {
  await withFakeFetch([{ status: 200, body: { id: 42 } }], async (count) => {
    const res = await fetchFromTMDBResolved('/movie/42', {}, { retryDelays: [1, 1] });
    assert.deepEqual(res, { ok: true, data: { id: 42 }, status: 200, retryable: false });
    assert.equal(count(), 1, 'a clean 200 does not retry');
  });
});

test('fetchFromTMDBResolved: 429 then 200 → retried, resolves ok', async () => {
  await withFakeFetch([{ status: 429 }, { status: 200, body: { id: 5 } }], async (count) => {
    const res = await fetchFromTMDBResolved('/movie/5', {}, { retryDelays: [1, 1] });
    assert.equal(res.ok, true);
    assert.deepEqual(res.data, { id: 5 });
    assert.equal(count(), 2, 'one retry after the 429');
  });
});

test('fetchFromTMDBResolved: persistent 429 → ok:false, retryable:true after exhausting retries', async () => {
  await withFakeFetch([{ status: 429 }], async (count) => {
    const res = await fetchFromTMDBResolved('/movie/5', {}, { retryDelays: [1, 1] });
    assert.equal(res.ok, false);
    assert.equal(res.retryable, true, '429 is transient → caller may retry');
    assert.equal(res.status, 429);
    assert.equal(count(), 3, 'initial attempt + 2 retries');
  });
});

test('fetchFromTMDBResolved: 404 → ok:false, retryable:false (terminal, not retried)', async () => {
  await withFakeFetch([{ status: 404 }], async (count) => {
    const res = await fetchFromTMDBResolved('/movie/0', {}, { retryDelays: [1, 1] });
    assert.equal(res.ok, false);
    assert.equal(res.retryable, false, '404 is a clean not-found → terminal');
    assert.equal(res.status, 404);
    assert.equal(count(), 1, '404 is not retried');
  });
});

test('fetchFromTMDBResolved: network error → retried, then retryable:true', async () => {
  await withFakeFetch([new Error('network down')], async (count) => {
    const res = await fetchFromTMDBResolved('/movie/5', {}, { retryDelays: [1, 1] });
    assert.equal(res.ok, false);
    assert.equal(res.retryable, true);
    assert.equal(res.status, null);
    assert.equal(count(), 3, 'network error retried to exhaustion');
  });
});
