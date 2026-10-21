/** Checkout telemetry shared by session creation and signed Stripe webhooks. */
export type CheckoutSession = {
  id: string;
  mode: string | null;
  created: number;
  expires_at: number;
  livemode: boolean;
  payment_status: string;
  metadata?: { [key: string]: string } | null;
};

export function checkoutSessionProperties(session: CheckoutSession) {
  return {
    channel: 'stripe',
    checkout_type: 'subscription',
    checkout_session_id: session.id,
    checkout_created_at: new Date(session.created * 1000).toISOString(),
    checkout_expires_at: new Date(session.expires_at * 1000).toISOString(),
    livemode: session.livemode,
  };
}

/** Completed means paid or a no-payment trial, never an asynchronous payment still pending. */
export function checkoutOutcome(type: string, session: CheckoutSession) {
  if (session.mode !== 'subscription') return null;
  const properties = { ...checkoutSessionProperties(session), payment_status: session.payment_status };
  if (type === 'checkout.session.expired') {
    if (session.metadata?.plot_expiry_reason === 'superseded') {
      return { event: 'premium_checkout_superseded', properties: { ...properties, reason: 'session_replaced' } };
    }
    // Keep the shipped event name so historical expiry counts stay continuous.
    return { event: 'premium_checkout_cancelled', properties: { ...properties, reason: 'session_expired' } };
  }
  if ((type === 'checkout.session.completed' || type === 'checkout.session.async_payment_succeeded')
    && ['paid', 'no_payment_required'].includes(session.payment_status)) {
    return { event: 'premium_checkout_completed', properties };
  }
  if (type === 'checkout.session.async_payment_failed') {
    return { event: 'premium_checkout_failed', properties: { ...properties, reason: 'async_payment_failed', stage: 'payment' } };
  }
  return null;
}

/** Stable UUID and timestamp let PostHog deduplicate a reused session or webhook retry. */
export async function checkoutEventUuid(event: string, sourceId: string) {
  const digest = new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(`${event}:${sourceId}`))).slice(0, 16);
  digest[6] = (digest[6] & 0x0f) | 0x80;
  digest[8] = (digest[8] & 0x3f) | 0x80;
  const hex = Array.from(digest, byte => byte.toString(16).padStart(2, '0')).join('');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

export function paymentFailurePhase(billingReason: string | null) {
  return billingReason === 'subscription_create' ? 'initial' : billingReason === 'subscription_cycle' ? 'renewal' : 'other';
}
