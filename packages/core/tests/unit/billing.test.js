import assert from 'node:assert/strict';
import test from 'node:test';
import { billingAccess, loadPremiumEntitlement } from '../../billing.js';

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
