import { checkoutEventUuid, checkoutOutcome, checkoutSessionProperties, paymentFailurePhase } from './checkoutAnalytics.ts';

function equal(actual: unknown, expected: unknown) {
  if (JSON.stringify(actual) !== JSON.stringify(expected)) throw new Error(`Expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
}
const session = { id: 'cs_test_fixture', mode: 'subscription', created: 1700000000, expires_at: 1700086400, livemode: false, payment_status: 'unpaid' };

Deno.test('session expiry is abandonment, never a payment failure or a Back click', () => {
  const expired = checkoutOutcome('checkout.session.expired', session);
  equal(expired?.event, 'premium_checkout_cancelled');
  equal(expired && 'reason' in expired.properties ? expired.properties.reason : null, 'session_expired');
  equal(checkoutOutcome('checkout.session.cancelled', session), null);
  equal(checkoutOutcome('checkout.session.expired', { ...session, mode: 'payment' }), null);
});
Deno.test('a plan or configuration replacement is not abandonment', () => {
  const replaced = checkoutOutcome('checkout.session.expired', { ...session, metadata: { plot_expiry_reason: 'superseded' } });
  equal(replaced?.event, 'premium_checkout_superseded');
});
Deno.test('paid checkout and no-payment trial count as complete; pending async payments do not', () => {
  for (const payment_status of ['paid', 'no_payment_required']) {
    equal(checkoutOutcome('checkout.session.completed', { ...session, payment_status })?.event, 'premium_checkout_completed');
  }
  equal(checkoutOutcome('checkout.session.completed', session), null);
  equal(checkoutOutcome('checkout.session.async_payment_succeeded', { ...session, payment_status: 'paid' })?.event, 'premium_checkout_completed');
  equal(checkoutOutcome('checkout.session.async_payment_succeeded', { ...session, mode: 'payment', payment_status: 'paid' }), null);
});
Deno.test('asynchronous payment failures are explicit and exclude tips', () => {
  const failed = checkoutOutcome('checkout.session.async_payment_failed', session);
  equal(failed?.event, 'premium_checkout_failed');
  equal(failed && 'stage' in failed.properties ? failed.properties.stage : null, 'payment');
  equal(checkoutOutcome('checkout.session.async_payment_failed', { ...session, mode: 'payment' }), null);
});
Deno.test('start, expiry and completion carry the same session key without a checkout URL or personal details', () => {
  equal(checkoutSessionProperties(session), {
    channel: 'stripe', checkout_type: 'subscription', checkout_session_id: 'cs_test_fixture',
    checkout_created_at: '2023-11-14T22:13:20.000Z', checkout_expires_at: '2023-11-15T22:13:20.000Z', livemode: false,
  });
});
Deno.test('reused sessions and retried webhooks have stable UUIDs; different sessions and outcomes stay distinct', async () => {
  const first = await checkoutEventUuid('premium_checkout_started', session.id);
  equal(first, await checkoutEventUuid('premium_checkout_started', session.id));
  equal(/^[0-9a-f]{8}-[0-9a-f]{4}-8[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(first), true);
  equal(first === await checkoutEventUuid('premium_checkout_completed', session.id), false);
  equal(first === await checkoutEventUuid('premium_checkout_started', 'cs_test_other'), false);
});
Deno.test('renewal failures do not masquerade as failed first checkouts', () => {
  equal(paymentFailurePhase('subscription_create'), 'initial');
  equal(paymentFailurePhase('subscription_cycle'), 'renewal');
  equal(paymentFailurePhase('subscription_update'), 'other');
  equal(paymentFailurePhase(null), 'other');
});
