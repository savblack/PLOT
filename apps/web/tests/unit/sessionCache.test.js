import assert from 'node:assert/strict';
import test from 'node:test';
import {
  cacheOnboardingComplete,
  readCachedSession,
  writeCachedSession,
} from '../../src/utils/sessionCache.js';

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

test('onboarding completion cache preserves the current profile', () => {
  withFakeStorage(() => {
    writeCachedSession('user-1', { id: 'user-1', region: 'AU', onboarding_complete: false });

    cacheOnboardingComplete('user-1');

    assert.deepEqual(readCachedSession(), {
      userId: 'user-1',
      profile: { id: 'user-1', region: 'AU', onboarding_complete: true },
    });
  });
});

test('onboarding completion cache never carries another account profile forward', () => {
  withFakeStorage(() => {
    writeCachedSession('user-1', { id: 'user-1', region: 'AU', onboarding_complete: true });

    cacheOnboardingComplete('user-2');

    assert.deepEqual(readCachedSession(), {
      userId: 'user-2',
      profile: { onboarding_complete: true },
    });
  });
});
