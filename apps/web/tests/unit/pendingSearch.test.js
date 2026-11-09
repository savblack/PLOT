import assert from 'node:assert/strict';
import test from 'node:test';
import {
  normalizePendingSearch,
  writePendingSearch,
  takePendingSearch,
  MAX_PENDING_SEARCH_LENGTH,
} from '../../src/utils/pendingSearch.js';

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

test('normalizePendingSearch trims, collapses spaces and drops empties', () => {
  assert.equal(normalizePendingSearch('  The   Bear '), 'The Bear');
  assert.equal(normalizePendingSearch('   '), null);
  assert.equal(normalizePendingSearch(''), null);
  assert.equal(normalizePendingSearch(null), null);
  assert.equal(normalizePendingSearch(42), null);
});

test('normalizePendingSearch caps the length at the homepage field limit', () => {
  const long = 'a'.repeat(MAX_PENDING_SEARCH_LENGTH + 50);
  assert.equal(normalizePendingSearch(long).length, MAX_PENDING_SEARCH_LENGTH);
});

test('a written search is taken once, then gone', () => withFakeStorage(() => {
  assert.equal(writePendingSearch(' Severance '), 'Severance');
  assert.equal(takePendingSearch(), 'Severance');
  assert.equal(takePendingSearch(), null);
}));

test('an empty search is never stored', () => withFakeStorage((store) => {
  assert.equal(writePendingSearch('   '), null);
  assert.equal(store.size, 0);
}));

test('a search older than a day is dropped, and cleared either way', () => withFakeStorage((store) => {
  writePendingSearch('Severance');
  const later = Date.now() + 25 * 60 * 60 * 1000;
  assert.equal(takePendingSearch(later), null);
  assert.equal(store.size, 0);
}));

test('corrupt storage is cleared rather than thrown', () => withFakeStorage((store) => {
  store.set('plot_pending_search', '{not json');
  assert.equal(takePendingSearch(), null);
  assert.equal(store.size, 0);
}));
