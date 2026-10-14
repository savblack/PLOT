/**
 * stripe-webhook
 *
 * Receives Stripe events for the Plot Premium subscription and maintains
 * billing state:
 *   - billing_customers  (entitlement source of truth, service-role only)
 *   - profiles.is_premium (cosmetic badge mirror read by the app/OG cards)
 *
 * Subscribed events (configure these on the Stripe endpoint):
 *   checkout.session.completed     first purchase — maps Stripe customer -> user
 *                                  and records paid one-time tips
 *   checkout.session.async_payment_succeeded  delayed-payment tips
 *   checkout.session.expired        abandoned Premium Checkout sessions
 *   customer.subscription.created  subscription exists; same snapshot path as updated
 *   customer.subscription.updated  renewals, plan switches, past_due, cancel_at_period_end
 *   customer.subscription.deleted  final cancellation
 *   invoice.payment_failed         refetch the subscription (past_due / unpaid)
 *   invoice.payment_succeeded      refetch the subscription (active after a retry)
 *   invoice.paid                   same snapshot as payment_succeeded
 *   customer.subscription.trial_will_end  emails the trial-ending reminder the
 *                                  Terms promise (Stripe sends it N days before
 *                                  trial_end; N is the Dashboard "Trial ending
 *                                  events" setting, default 3)
 *
 * Signature: Stripe-Signature, via constructEventAsync. A bad or missing
 * signature is rejected before any write. Idempotency: apply_stripe_subscription_event
 * inserts stripe_events in the same transaction as the billing row, so a
 * repeated event id does not apply twice. Invoice events do not trust the
 * invoice's implied status; they refetch the subscription and write that.
 *
 * Auth is the Stripe signature, not a Supabase JWT — deploy with
 * verify_jwt = false (see supabase/config.toml).
 *
 * Secrets: STRIPE_SECRET_KEY, STRIPE_WEBHOOK_SECRET, RESEND_API_KEY (the
 * reminder), and optionally STRIPE_SETTINGS_URL (where its button goes).
 */
import Stripe from 'npm:stripe@22.3.2';
import { createClient } from 'npm:@supabase/supabase-js@2';
import { serviceKey } from '../_shared/serviceKey.ts';
import { billingSettingsUrl, cancelsAtPeriodEnd } from '../_shared/billingPolicy.ts';
import { reconcileBillingSnapshot } from '../_shared/billingSnapshot.ts';
import { capturePostHogEvent, normaliseCurrency } from '../_shared/posthog.ts';
import { subscriptionIdFromInvoice, webhookAction } from '../_shared/stripeEvents.ts';
import { TRIAL_REMINDER_FROM, TRIAL_REMINDER_REPLY_TO, buildTrialReminderEmail, planFromPrice } from '../_shared/trialReminderEmail.js';

const RESEND_API_URL = 'https://api.resend.com/emails';

const stripe = new Stripe(Deno.env.get('STRIPE_SECRET_KEY') ?? '', {
  httpClient: Stripe.createFetchHttpClient(),
});
const cryptoProvider = Stripe.createSubtleCryptoProvider();

const admin = () =>
  createClient(
    Deno.env.get('SUPABASE_URL')!,
    serviceKey(),
  );

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });

// Stripe API versions >= 2025-03-31 moved current_period_end onto the
// subscription items; older versions have it on the subscription. Read both.
function periodEnd(sub: Stripe.Subscription): string | null {
  const raw =
    (sub.items?.data?.[0] as unknown as { current_period_end?: number })
      ?.current_period_end ?? (sub as unknown as { current_period_end?: number }).current_period_end;
  return raw ? new Date(raw * 1000).toISOString() : null;
}

type SyncArgs = {
  userId: string;
  customerId: string;
  sub: Stripe.Subscription;
  event: Stripe.Event;
};

async function syncSubscription({ userId, customerId, sub, event }: SyncArgs) {
  return await reconcileBillingSnapshot(
    async () => {
      const { data, error } = await admin().from('billing_customers').select('revision').eq('user_id', userId).maybeSingle();
      if (error) throw error;
      return data?.revision ?? null;
    },
    () => stripe.subscriptions.retrieve(sub.id, { expand: ['items.data.price'] }),
    async (current, revision) => {
      if ((typeof current.customer === 'string' ? current.customer : current.customer.id) !== customerId) throw new Error('Subscription customer mismatch');
      const end = periodEnd(current);
      const { data, error } = await admin().rpc('apply_stripe_subscription_snapshot', {
        p_expected_revision: revision,
        p_event_id: event.id,
        p_event_type: event.type,
        p_event_created: new Date(event.created * 1000).toISOString(),
        p_user_id: userId,
        p_customer_id: customerId,
        p_subscription_id: current.id,
        p_status: current.status,
        p_price_id: current.items?.data?.[0]?.price?.id ?? null,
        p_cancel_at_period_end: cancelsAtPeriodEnd(current, end),
        p_current_period_end: end,
      });
      if (error) throw new Error(`Subscription transaction failed: ${error.message}`);
      return data;
    },
  );
}

// Resolve the Supabase user for a subscription event: mapping table first,
// then the metadata stamped onto the subscription at checkout time.
async function resolveUser(customerId: string, sub: Stripe.Subscription) {
  const { data, error } = await admin()
    .from('billing_customers')
    .select('user_id')
    .eq('stripe_customer_id', customerId)
    .maybeSingle();
  if (error) throw new Error(`Billing account lookup failed: ${error.message}`);
  return data?.user_id ?? sub.metadata?.supabase_user_id ?? null;
}

async function capturePremiumConversion(userId: string, sub: Stripe.Subscription, event: Stripe.Event) {
  try {
    const rawPrice = sub.items?.data?.[0]?.price;
    const price = typeof rawPrice === 'string' ? await stripe.prices.retrieve(rawPrice) : rawPrice;
    const interval = price?.recurring?.interval;
    await capturePostHogEvent('premium_converted', userId, {
      channel: 'stripe',
      checkout_type: 'subscription',
      plan: interval === 'year' ? 'yearly' : interval === 'month' ? 'monthly' : null,
      price_id: price?.id ?? null,
      amount: typeof price?.unit_amount === 'number' ? price.unit_amount / 100 : null,
      currency: normaliseCurrency(price?.currency),
    }, new Date(event.created * 1000).toISOString());
  } catch (err) {
    // Analytics must never make Stripe retry a successfully-applied billing
    // event. The subscription state is already committed at this point.
    console.error(`stripe-webhook: PostHog conversion capture failed for ${event.id}: ${(err as Error).message}`);
  }
}

async function recordPremiumCheckoutCancellation(event: Stripe.Event) {
  const session = event.data.object as Stripe.Checkout.Session;
  if (session.mode !== 'subscription') return;
  const userId = session.client_reference_id ?? session.metadata?.supabase_user_id;
  if (!userId) return;
  const { error: receiptError } = await admin().from('stripe_events').insert({ id: event.id, type: event.type });
  if (receiptError?.code === '23505') return;
  if (receiptError) throw receiptError;
  try {
    await capturePostHogEvent('premium_checkout_cancelled', userId, {
      channel: 'stripe',
      checkout_type: 'subscription',
      reason: 'session_expired',
    }, new Date(event.created * 1000).toISOString());
  } catch (err) {
    // The receipt makes the event idempotent. Analytics failure should not
    // make Stripe retry an already-recorded expiry.
    console.error(`stripe-webhook: checkout cancellation capture failed for ${event.id}: ${(err as Error).message}`);
  }
}

async function captureStripeTip(session: Stripe.Checkout.Session, event: Stripe.Event) {
  if (session.payment_status !== 'paid') return;
  const userId = session.client_reference_id ?? session.metadata?.supabase_user_id;
  if (!userId) return;
  try {
    await capturePostHogEvent('support_converted', userId, {
      channel: 'stripe',
      checkout_type: 'tip',
      matched: true,
      // Match Ko-fi's major-unit amount property (for example, 5.00 AUD).
      amount: typeof session.amount_total === 'number' ? session.amount_total / 100 : null,
      currency: normaliseCurrency(session.currency),
    }, new Date(event.created * 1000).toISOString());
  } catch (err) {
    console.error(`stripe-webhook: PostHog tip capture failed for ${event.id}: ${(err as Error).message}`);
  }
}

/** Invoice events carry a subscription id, not the status we store. Refetch. */
async function subscriptionForInvoice(event: Stripe.Event) {
  const invoice = event.data.object as Stripe.Invoice;
  const subId = subscriptionIdFromInvoice(invoice as Parameters<typeof subscriptionIdFromInvoice>[0]);
  if (!subId) return null;
  return await stripe.subscriptions.retrieve(subId, { expand: ['items.data.price'] });
}

/**
 * The reminder before a trial converts. Receipt first so a Stripe retry cannot
 * send it twice; if the send fails the receipt is removed so the retry can.
 * A subscription that is not on a Plot price, or a user without an address, is
 * acknowledged and logged rather than retried: there is nothing to send.
 */
async function sendTrialReminder(event: Stripe.Event) {
  const sub = event.data.object as Stripe.Subscription;
  const resendKey = Deno.env.get('RESEND_API_KEY');
  // Loud, not silent: a missing key is a deployment mistake, so let Stripe retry.
  if (!resendKey) throw new Error('RESEND_API_KEY is not set');
  const customerId = typeof sub.customer === 'string' ? sub.customer : sub.customer.id;
  const userId = await resolveUser(customerId, sub);
  if (!userId) {
    console.error(`${event.type}: no user for customer ${customerId}`);
    return;
  }
  const plan = planFromPrice(sub.items?.data?.[0]?.price ?? null);
  if (!plan || typeof sub.trial_end !== 'number') {
    console.error(`${event.type}: subscription ${sub.id} is not a Plot trial`);
    return;
  }
  const { data: user, error: userError } = await admin().auth.admin.getUserById(userId);
  if (userError) throw new Error(`User lookup failed: ${userError.message}`);
  const to = user?.user?.email;
  if (!to) {
    console.error(`${event.type}: no email for user`);
    return;
  }
  const { error: receiptError } = await admin().from('stripe_events').insert({ id: event.id, type: event.type });
  if (receiptError?.code === '23505') return;
  if (receiptError) throw receiptError;
  const message = buildTrialReminderEmail({ trialEnd: sub.trial_end, plan, manageUrl: billingSettingsUrl(Deno.env.get('STRIPE_SETTINGS_URL')) });
  const res = await fetch(RESEND_API_URL, {
    method: 'POST',
    headers: { Authorization: `Bearer ${resendKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ from: TRIAL_REMINDER_FROM, reply_to: TRIAL_REMINDER_REPLY_TO, to: [to], ...message }),
  });
  if (!res.ok) {
    await admin().from('stripe_events').delete().eq('id', event.id);
    throw new Error(`Resend request failed with status ${res.status}`);
  }
}

async function recordStripeTip(event: Stripe.Event) {
  const session = event.data.object as Stripe.Checkout.Session;
  if (session.mode !== 'payment' || session.metadata?.kind !== 'tip' || session.payment_status !== 'paid') return;
  const { error: receiptError } = await admin().from('stripe_events').insert({ id: event.id, type: event.type });
  if (receiptError?.code === '23505') return;
  if (receiptError) throw receiptError;
  await captureStripeTip(session, event);
}

Deno.serve(async (req) => {
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405);

  const signature = req.headers.get('stripe-signature');
  if (!signature) return json({ error: 'Missing signature' }, 400);

  const rawBody = await req.text();
  let event: Stripe.Event;
  try {
    event = await stripe.webhooks.constructEventAsync(
      rawBody,
      signature,
      Deno.env.get('STRIPE_WEBHOOK_SECRET') ?? '',
      undefined,
      cryptoProvider,
    );
  } catch (err) {
    console.error('Signature verification failed:', (err as Error).message);
    return json({ error: 'Invalid signature' }, 400);
  }

  try {
    // webhookAction() is the list under test. A new lifecycle event has to be
    // added there and handled in this switch, or the tests fail and the event
    // is acknowledged without a billing write.
    switch (webhookAction(event.type)) {
      case 'checkout_completed': {
        const session = event.data.object as Stripe.Checkout.Session;
        if (session.mode !== 'subscription') {
          await recordStripeTip(event);
          break;
        }
        const userId = session.client_reference_id ?? session.metadata?.supabase_user_id;
        const customerId = typeof session.customer === 'string' ? session.customer : session.customer?.id;
        const subId = typeof session.subscription === 'string' ? session.subscription : session.subscription?.id;
        if (!userId || !customerId || !subId) {
          throw new Error('Checkout subscription is missing Plot linkage');
        }
        const sub = await stripe.subscriptions.retrieve(subId, { expand: ['items.data.price'] });
        const result = await syncSubscription({ userId, customerId, sub, event });
        if ((result as { applied?: boolean } | null)?.applied) await capturePremiumConversion(userId, sub, event);
        return json({ received: true, ...result });
      }
      case 'async_payment':
        await recordStripeTip(event);
        break;
      case 'checkout_expired':
        await recordPremiumCheckoutCancellation(event);
        break;
      case 'sync_subscription':
      case 'sync_invoice': {
        const sub = webhookAction(event.type) === 'sync_invoice'
          ? await subscriptionForInvoice(event)
          : event.data.object as Stripe.Subscription;
        if (!sub) break;
        const customerId = typeof sub.customer === 'string' ? sub.customer : sub.customer.id;
        const userId = await resolveUser(customerId, sub);
        if (!userId) {
          // Ack rather than retry forever. Checkout writes the customer row
          // before the session is returned, so a missing user is not the
          // normal first-purchase path.
          console.error(`${event.type}: no user for customer ${customerId}`);
          break;
        }
        return json({ received: true, ...await syncSubscription({ userId, customerId, sub, event }) });
      }
      case 'trial_ending':
        await sendTrialReminder(event);
        break;
      case 'ignore':
        break;
    }
  } catch (err) {
    console.error(`Handler failed for ${event.type}:`, (err as Error).message);
    // The RPC rolls back its receipt with the failed state update. No cleanup
    // request (which could also fail) is needed before Stripe retries.
    return json({ error: 'Handler failure' }, 500);
  }

  return json({ received: true });
});
