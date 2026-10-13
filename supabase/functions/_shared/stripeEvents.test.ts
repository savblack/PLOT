import { subscriptionIdFromInvoice, webhookAction } from './stripeEvents.ts';

function equal(actual: unknown, expected: unknown) {
  if (actual !== expected) throw new Error(`Expected ${expected}, got ${actual}`);
}

Deno.test('subscription lifecycle events sync billing state', () => {
  for (const type of [
    'customer.subscription.created',
    'customer.subscription.updated',
    'customer.subscription.deleted',
  ]) equal(webhookAction(type), 'sync_subscription');
});

Deno.test('invoice payment events sync billing state from the live subscription', () => {
  equal(webhookAction('invoice.payment_failed'), 'sync_invoice');
  equal(webhookAction('invoice.payment_succeeded'), 'sync_invoice');
  equal(webhookAction('invoice.paid'), 'sync_invoice');
});

Deno.test('checkout completion, expiry and ignored events stay distinct', () => {
  equal(webhookAction('checkout.session.completed'), 'checkout_completed');
  equal(webhookAction('checkout.session.async_payment_succeeded'), 'async_payment');
  equal(webhookAction('checkout.session.expired'), 'checkout_expired');
  equal(webhookAction('invoice.created'), 'ignore');
  equal(webhookAction('customer.created'), 'ignore');
});

Deno.test('invoice subscription id is read from the legacy and current payload shapes', () => {
  equal(subscriptionIdFromInvoice(null), null);
  equal(subscriptionIdFromInvoice({}), null);
  equal(subscriptionIdFromInvoice({ subscription: 'sub_legacy' }), 'sub_legacy');
  equal(subscriptionIdFromInvoice({ subscription: { id: 'sub_obj' } }), 'sub_obj');
  equal(subscriptionIdFromInvoice({
    parent: { subscription_details: { subscription: 'sub_current' } },
  }), 'sub_current');
  equal(subscriptionIdFromInvoice({
    subscription: 'sub_legacy',
    parent: { subscription_details: { subscription: 'sub_current' } },
  }), 'sub_legacy');
  equal(subscriptionIdFromInvoice({
    parent: { subscription_details: { subscription: { id: 'sub_nested' } } },
  }), 'sub_nested');
});
