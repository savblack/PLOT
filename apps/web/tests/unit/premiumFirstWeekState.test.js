import assert from 'node:assert/strict';
import test from 'node:test';
import { beginPremiumFirstWeek, readPremiumFirstWeek } from '../../src/utils/premiumFirstWeekState.js';

// A stand-in browser: storage.js only needs window.localStorage and a document.
function withStorage(storage, run) {
  const before = { window: globalThis.window, document: globalThis.document };
  globalThis.window = { localStorage: storage };
  globalThis.document = {};
  try { return run(); } finally { globalThis.window = before.window; globalThis.document = before.document; }
}

function memoryStorage() {
  const map = new Map();
  return { getItem: key => (map.has(key) ? map.get(key) : null), setItem: (key, value) => { map.set(key, String(value)); } };
}

test('the first return from checkout starts the week; a second one does not', () => {
  withStorage(memoryStorage(), () => {
    assert.equal(beginPremiumFirstWeek('user-1'), true);
    const started = readPremiumFirstWeek('user-1');
    assert.equal(typeof started.startedAt, 'number');
    // A plan change comes back through checkout again: same week, not counted twice.
    assert.equal(beginPremiumFirstWeek('user-1'), false);
    assert.deepEqual(readPremiumFirstWeek('user-1'), started);
    // Another account on the same browser gets its own week.
    assert.equal(beginPremiumFirstWeek('user-2'), true);
  });
});

test('nothing is counted when the browser will not store the week, or nobody is signed in', () => {
  const refusing = { getItem: () => null, setItem: () => { throw new Error('storage is off'); } };
  withStorage(refusing, () => {
    assert.equal(beginPremiumFirstWeek('user-1'), false);
    assert.equal(readPremiumFirstWeek('user-1'), null);
  });
  withStorage(memoryStorage(), () => {
    assert.equal(beginPremiumFirstWeek(undefined), false);
  });
});
