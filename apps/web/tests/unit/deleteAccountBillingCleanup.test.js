import assert from 'node:assert/strict';
import test from 'node:test';
import { stopAccountBilling } from '../../../../supabase/functions/delete-account/billingCleanup.js';

function adminFor(billing, attempt) {
  return { from(table) {
    return { select() { return { eq(_column, userId) {
      assert.equal(userId, 'user-123');
      return { async maybeSingle() {
        return { data: table === 'billing_customers' ? billing : attempt, error: null };
      } };
    } }; } };
  } };
}

test('account deletion expires checkout before canceling all live subscriptions', async () => {
  const calls = [];
  const stripe = {
    checkout: { sessions: {
      async retrieve(id) {
        assert.equal(id, 'cs_123');
        calls.push('retrieve');
        return { id, status: 'open', customer: 'cus_123', client_reference_id: 'user-123' };
      },
      async expire(id) { assert.equal(id, 'cs_123'); calls.push('expire'); },
    } },
    subscriptions: {
      async *list(options) {
        assert.deepEqual(options, { customer: 'cus_123', status: 'all', limit: 100 });
        calls.push('list');
        yield { id: 'sub_active', status: 'active' };
        yield { id: 'sub_trial', status: 'trialing' };
        yield { id: 'sub_old', status: 'canceled' };
      },
      async cancel(id, options) {
        assert.deepEqual(options, { invoice_now: false, prorate: false });
        calls.push(`cancel:${id}`);
      },
    },
  };

  await stopAccountBilling(adminFor({ stripe_customer_id: 'cus_123', stripe_subscription_id: 'sub_old' }, { session_id: 'cs_123' }), () => stripe, 'user-123');
  assert.deepEqual(calls, ['retrieve', 'expire', 'list', 'cancel:sub_active', 'cancel:sub_trial']);
});

test('account deletion without billing needs no Stripe configuration', async () => {
  await stopAccountBilling(adminFor(null, null), () => { throw new Error('Stripe must not be initialized'); }, 'user-123');
});

test('Stripe cancellation failure prevents account deletion from continuing', async () => {
  const stripe = { subscriptions: {
    async *list() { yield { id: 'sub_active', status: 'active' }; },
    async cancel() { throw new Error('Stripe unavailable'); },
  } };
  await assert.rejects(
    stopAccountBilling(adminFor({ stripe_customer_id: 'cus_123', stripe_subscription_id: 'sub_active' }, null), () => stripe, 'user-123'),
    /Stripe unavailable/,
  );
});

test('a checkout session Stripe no longer has does not block deletion', async () => {
  const calls = [];
  const stripe = {
    checkout: { sessions: {
      async retrieve() { throw Object.assign(new Error('No such checkout.session'), { code: 'resource_missing' }); },
    } },
    subscriptions: {
      async *list() { calls.push('list'); yield { id: 'sub_active', status: 'active' }; },
      async cancel(id) { calls.push(`cancel:${id}`); },
    },
  };
  await stopAccountBilling(adminFor({ stripe_customer_id: 'cus_123' }, { session_id: 'cs_gone' }), () => stripe, 'user-123');
  assert.deepEqual(calls, ['list', 'cancel:sub_active']);
});

test('a checkout session for another user cannot be expired', async () => {
  const stripe = { checkout: { sessions: {
    async retrieve() { return { id: 'cs_123', status: 'open', customer: 'cus_123', client_reference_id: 'other-user' }; },
    async expire() { throw new Error('must not expire'); },
  } } };
  await assert.rejects(
    stopAccountBilling(adminFor({ stripe_customer_id: 'cus_123' }, { session_id: 'cs_123' }), () => stripe, 'user-123'),
    /another account/,
  );
});
