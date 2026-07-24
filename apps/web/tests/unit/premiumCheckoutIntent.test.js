import assert from 'node:assert/strict';
import test from 'node:test';
import { getPremiumCheckoutIntent, rememberPremiumCheckoutIntent, takePremiumCheckoutIntent } from '../../src/utils/premiumCheckoutIntent.js';

function withStorage(run) {
  const values = new Map();
  globalThis.window = {
    sessionStorage: {
      getItem: (key) => values.get(key) ?? null,
      setItem: (key, value) => values.set(key, value),
      removeItem: (key) => values.delete(key),
    },
  };
  try { run(); } finally { delete globalThis.window; }
}

test('keeps a valid Premium plan until onboarding consumes it', () => {
  withStorage(() => {
    assert.equal(rememberPremiumCheckoutIntent('?intent=premium&plan=yearly'), 'yearly');
    assert.equal(getPremiumCheckoutIntent(), 'yearly');
    assert.equal(takePremiumCheckoutIntent(), 'yearly');
    assert.equal(takePremiumCheckoutIntent(), null);
  });
});

test('ignores non-Premium and invalid billing intents', () => {
  withStorage(() => {
    assert.equal(rememberPremiumCheckoutIntent('?intent=free&plan=yearly'), null);
    assert.equal(rememberPremiumCheckoutIntent('?intent=premium&plan=weekly'), null);
    assert.equal(takePremiumCheckoutIntent(), null);
  });
});
