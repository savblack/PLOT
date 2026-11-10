import assert from 'node:assert/strict';
import test from 'node:test';
import { billingAccess, loadPremiumEntitlement, trialEligible } from '../../billing.js';

test('billing controls require authoritative entitlement and relationship independently', () => {
  for (const status of [null, undefined, {}, { isPremium: false, canManage: false }, { isPremium: 'true', canManage: 'true' }]) {
    assert.deepEqual(billingAccess(status), { isPremium: false, canManage: false });
  }
  assert.deepEqual(billingAccess({ isPremium: false, canManage: true }), { isPremium: false, canManage: true });
  assert.deepEqual(billingAccess({ isPremium: true, canManage: false }), { isPremium: true, canManage: false });
  assert.deepEqual(billingAccess({ isPremium: true, canManage: true }), { isPremium: true, canManage: true });
});

test('entitlement reads the authenticated RPC without choosing another account', async () => {
  const client = { async rpc(...args) {
    assert.deepEqual(args, ['is_premium']);
    return { data: true, error: null };
  } };
  assert.equal(await loadPremiumEntitlement(client), true);
});

test('expired entitlement and unavailable entitlement never reuse a stale premium badge', async () => {
  for (const result of [{ data: false, error: null }, { data: true, error: new Error('offline') }, { data: null, error: null }]) {
    assert.equal(await loadPremiumEntitlement({ rpc: async () => result }), false);
  }
  assert.equal(await loadPremiumEntitlement({ rpc: async () => { throw new Error('network'); } }), false);
});

test('the trial is only promised to a signed-in viewer with no subscription on record', () => {
  // Never subscribed: the read succeeded and shows nothing.
  assert.equal(trialEligible({ isPremium: false, canManage: false, status: null, cancelAtPeriodEnd: false, periodEnd: null }), true);
  // A failed or pending read, or a signed-out visitor: say nothing about a trial.
  assert.equal(trialEligible(null), false);
  assert.equal(trialEligible(undefined), false);
  assert.equal(trialEligible({}), false);
  // Subscribed now, or before: the server gives no second trial.
  assert.equal(trialEligible({ isPremium: true, canManage: true, status: 'active' }), false);
  assert.equal(trialEligible({ isPremium: true, canManage: true, status: 'trialing' }), false);
  assert.equal(trialEligible({ isPremium: false, canManage: true, status: 'canceled' }), false);
  // Any trace of a subscription is enough to stay quiet, even a mismatched one.
  assert.equal(trialEligible({ isPremium: false, canManage: false, status: 'canceled' }), false);
  assert.equal(trialEligible({ isPremium: false, canManage: true, status: null }), false);
  // Premium granted by Plot without Stripe (no subscription to manage) is still not a trial case.
  assert.equal(trialEligible({ isPremium: true, canManage: false, status: null }), false);
});
