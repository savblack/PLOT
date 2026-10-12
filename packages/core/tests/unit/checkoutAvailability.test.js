import assert from 'node:assert/strict';
import test from 'node:test';
import { loadCheckoutAvailability, premiumPurchaseState } from '../../checkoutAvailability.js';

test('purchase state is open, closed, or unknown', () => {
  assert.equal(premiumPurchaseState(true), 'open');
  assert.equal(premiumPurchaseState(false), 'closed');
  assert.equal(premiumPurchaseState(null), 'unknown');
  assert.equal(premiumPurchaseState(undefined), 'unknown');
});

test('availability reads the server boolean and fails to unknown', async () => {
  const calls = [];
  const fetchImpl = async (url, init) => {
    calls.push({ url, init });
    return { ok: true, json: async () => ({ checkoutAvailable: false }) };
  };
  assert.equal(await loadCheckoutAvailability({
    fetchImpl,
    url: 'https://example.test/billing-availability',
    anonKey: 'anon',
    getSessionToken: async () => 'user-token',
  }), false);
  assert.equal(calls.length, 1);
  assert.equal(calls[0].init.headers.Authorization, 'Bearer user-token');
  assert.equal(calls[0].init.headers.apikey, 'anon');
  assert.equal(calls[0].init.method, 'POST');

  const open = await loadCheckoutAvailability({
    fetchImpl: async () => ({ ok: true, json: async () => ({ checkoutAvailable: true }) }),
    url: 'https://example.test/billing-availability',
    anonKey: 'anon',
    getSessionToken: async () => undefined,
  });
  assert.equal(open, true);

  for (const fetchImpl of [
    async () => ({ ok: false, json: async () => ({ error: 'nope' }) }),
    async () => ({ ok: true, json: async () => ({}) }),
    async () => { throw new Error('offline'); },
  ]) {
    assert.equal(await loadCheckoutAvailability({
      fetchImpl,
      url: 'https://example.test/billing-availability',
      anonKey: 'anon',
      getSessionToken: async () => undefined,
    }), null);
  }

  assert.equal(await loadCheckoutAvailability({ url: null, fetchImpl }), null);
});
