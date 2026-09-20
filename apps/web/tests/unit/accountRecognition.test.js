import assert from 'node:assert/strict';
import test from 'node:test';
import { isKnownAccountBrowser, markKnownAccountBrowser } from '../../src/utils/accountRecognition.js';

function withFakeStorage(fn) {
  const store = new Map();
  globalThis.window = {
    localStorage: {
      getItem: key => store.get(key) ?? null,
      setItem: (key, value) => store.set(key, String(value)),
    },
  };
  globalThis.document = {};
  try { return fn(store); }
  finally { delete globalThis.window; delete globalThis.document; }
}

test('account recognition stores only a device-level boolean', () => {
  withFakeStorage((store) => {
    assert.equal(isKnownAccountBrowser(), false);
    assert.equal(markKnownAccountBrowser(), true);
    assert.equal(isKnownAccountBrowser(), true);
    assert.deepEqual([...store.entries()], [['plot-known-account', '1']]);
  });
});
