import Stripe from 'npm:stripe@22.6.0';
import type { SupabaseClient } from 'npm:@supabase/supabase-js@2';

type Admin = SupabaseClient;
type Attempt = { operation_id: string; price_id: string; settings_url: string; session_id: string | null; started_at: string; lease_token: string; managed_payments: boolean };

// Only explicitly safe checkout messages may be returned to the client.
export class CheckoutPendingError extends Error {}

/** Stable operation identity survives response loss, edge restarts and lease expiry. */
export async function subscriptionCheckout(admin: Admin, stripe: Stripe, userId: string, price: string, settingsUrl: string, portal: (customer: string) => Promise<string>) {
  const { data, error } = await admin.rpc('claim_billing_checkout', { p_user_id: userId, p_price_id: price, p_settings_url: settingsUrl });
  if (error) throw error;
  if (!data) throw new CheckoutPendingError('Checkout is already being prepared. Please try again shortly.');
  let attempt = data as Attempt;
  const update = async (values: Record<string, unknown>) => {
    const { data: rows, error } = await admin.from('billing_checkout_attempts').update(values).eq('user_id', userId).eq('lease_token', attempt.lease_token).select('operation_id');
    if (error || !rows?.length) throw error || new Error('Checkout lease expired');
  };
  try {
    if (typeof attempt.managed_payments !== 'boolean') throw new CheckoutPendingError('Billing setup needs attention. Please try again later.');
    const { data: billing, error } = await admin.from('billing_customers').select('stripe_customer_id').eq('user_id', userId).maybeSingle();
    if (error) throw error;
    let customer = billing?.stripe_customer_id;
    if (!customer) {
      const created = await stripe.customers.create({ metadata: { supabase_user_id: userId } }, { idempotencyKey: `plot-customer-${userId}` });
      const { error } = await admin.from('billing_customers').upsert({ user_id: userId, stripe_customer_id: created.id }, { onConflict: 'user_id', ignoreDuplicates: true });
      if (error) throw error;
      const { data: saved, error: readError } = await admin.from('billing_customers').select('stripe_customer_id').eq('user_id', userId).single();
      if (readError || !saved) throw readError || new Error('Customer mapping unavailable');
      customer = saved.stripe_customer_id;
    }
    for await (const sub of stripe.subscriptions.list({ customer, status: 'all', limit: 100 })) {
      if (!['canceled', 'incomplete_expired'].includes(sub.status)) return await portal(customer);
    }
    if (attempt.session_id) {
      const session = await stripe.checkout.sessions.retrieve(attempt.session_id);
      if (session.status === 'complete') {
        const id = typeof session.subscription === 'string' ? session.subscription : session.subscription?.id;
        const sub = id ? await stripe.subscriptions.retrieve(id) : null;
        if (!sub || !['canceled', 'incomplete_expired'].includes(sub.status)) throw new CheckoutPendingError('Your previous payment is being confirmed. Please try again shortly.');
      }
      if (session.status === 'open' && attempt.price_id === price && attempt.managed_payments && session.managed_payments?.enabled) return session.url!;
      if (session.status === 'open') await stripe.checkout.sessions.expire(session.id);
      // Stripe confirmed the old session cannot complete. Only now start a new operation.
      attempt = { ...attempt, operation_id: crypto.randomUUID(), price_id: price, settings_url: settingsUrl, session_id: null, managed_payments: true, started_at: new Date().toISOString() };
      await update({ operation_id: attempt.operation_id, price_id: price, settings_url: settingsUrl, session_id: null, managed_payments: true, started_at: attempt.started_at });
    }
    // Never replay an uncertain creation beyond Stripe's 24-hour idempotency window.
    if (Date.now() - Date.parse(attempt.started_at) > 23 * 3600000) throw new CheckoutPendingError('Checkout needs review before another payment can be started. Please contact PLOT support.');
    const session = await stripe.checkout.sessions.create({
      mode: 'subscription', customer,
      // Omit new parameters when recovering a pre-migration idempotency key.
      ...(attempt.managed_payments ? { managed_payments: { enabled: true }, integration_identifier: 'plot_managed_qvtnzark' } : {}),
      line_items: [{ price: attempt.price_id, quantity: 1 }],
      client_reference_id: userId, metadata: { supabase_user_id: userId },
      subscription_data: { metadata: { supabase_user_id: userId } },
      success_url: `${attempt.settings_url}?checkout=success`, cancel_url: `${attempt.settings_url}?checkout=cancelled`,
      allow_promotion_codes: true,
    }, { idempotencyKey: `plot-checkout-${attempt.operation_id}` });
    await update({ session_id: session.id });
    if (!attempt.managed_payments) throw new CheckoutPendingError('Your checkout was updated. Please choose your plan again.');
    if (attempt.price_id !== price) throw new CheckoutPendingError('A previous plan checkout was recovered. Please choose your plan again.');
    return session.url!;
  } finally {
    // A stale worker cannot release a newer worker's lease.
    await admin.from('billing_checkout_attempts').update({ lease_until: null, lease_token: null }).eq('user_id', userId).eq('lease_token', attempt.lease_token);
  }
}
