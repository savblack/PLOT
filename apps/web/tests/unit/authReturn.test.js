import test from 'node:test';
import assert from 'node:assert/strict';
import { rememberReturnPath, takeReturnPath } from '../../src/utils/authReturn.js';

function memoryStorage() {
  const m = new Map();
  return { getItem: k => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), removeItem: k => m.delete(k) };
}

test('a remembered path comes back once, then falls back', () => {
  const storage = memoryStorage();
  rememberReturnPath('/u/sam/compare', { storage, now: 1000 });
  assert.equal(takeReturnPath('/app', { storage, now: 2000 }), '/u/sam/compare');
  assert.equal(takeReturnPath('/app', { storage, now: 3000 }), '/app');
});

test('it expires after half an hour', () => {
  const storage = memoryStorage();
  rememberReturnPath('/compare', { storage, now: 0 });
  assert.equal(takeReturnPath('/app', { storage, now: 31 * 60 * 1000 }), '/app');
});

test('only same-app paths are kept, never other sites or auth pages', () => {
  const storage = memoryStorage();
  for (const bad of ['https://evil.example/', '//evil.example', 'javascript:alert(1)', '/login', '/auth/callback', '/onboarding']) {
    rememberReturnPath(bad, { storage, now: 0 });
    assert.equal(takeReturnPath('/app', { storage, now: 1 }), '/app', bad);
  }
});

test('garbage in storage falls back rather than throwing', () => {
  const storage = memoryStorage();
  storage.setItem('plot_auth_return', '{not json');
  assert.equal(takeReturnPath('/app', { storage }), '/app');
});
