/**
 * stripe-webhook
 *
 * Receives Stripe events for the PLOT Premium subscription and maintains
 * billing state:
 *   - billing_customers  (entitlement source of truth, service-role only)
 *   - profiles.is_premium (cosmetic badge mirror read by the app/OG cards)
 *
 * Subscribed events (configure exactly these on the Stripe endpoint):
 *   checkout.session.completed     first purchase — maps Stripe customer -> user
 *   customer.subscription.updated  renewals, plan switches, past_due, cancel_at_period_end
 *   customer.subscription.deleted  final cancellation
 *
 * Auth is the Stripe signature, not a Supabase JWT — deploy with
 * verify_jwt = false (see supabase/config.toml).
 *
 * Secrets: STRIPE_SECRET_KEY, STRIPE_WEBHOOK_SECRET.
 */
import Stripe from 'npm:stripe@22.3.2';
import { createClient } from 'npm:@supabase/supabase-js@2';

const stripe = new Stripe(Deno.env.get('STRIPE_SECRET_KEY') ?? '', {
  httpClient: Stripe.createFetchHttpClient(),
});
const cryptoProvider = Stripe.createSubtleCryptoProvider();

const admin = () =>
  createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  );

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });

// Statuses that keep the Premium entitlement. past_due is included so a
// failing card keeps access through Stripe's retry window; the DB-side
// is_premium() adds a 3-day grace on current_period_end.
const ENTITLED = new Set(['active', 'trialing', 'past_due']);

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
  eventCreated: number;
};

async function syncSubscription({ userId, customerId, sub, eventCreated }: SyncArgs) {
  const db = admin();
  const eventAt = new Date(eventCreated * 1000).toISOString();

  // Out-of-order guard: never let an older event overwrite newer state.
  const { data: existing } = await db
    .from('billing_customers')
    .select('last_event_at')
    .eq('user_id', userId)
    .maybeSingle();
  if (existing?.last_event_at && existing.last_event_at > eventAt) return;

  const end = periodEnd(sub);
  const { error: billErr } = await db.from('billing_customers').upsert({
    user_id: userId,
    stripe_customer_id: customerId,
    stripe_subscription_id: sub.id,
    subscription_status: sub.status,
    price_id: sub.items?.data?.[0]?.price?.id ?? null,
    cancel_at_period_end: !!sub.cancel_at_period_end,
    current_period_end: end,
    last_event_at: eventAt,
    updated_at: new Date().toISOString(),
  });
  if (billErr) throw new Error(`billing_customers upsert failed: ${billErr.message}`);

  const entitled = ENTITLED.has(sub.status) && !!end && new Date(end).getTime() > Date.now();
  const { error: profErr } = await db
    .from('profiles')
    .update({ is_premium: entitled })
    .eq('id', userId);
  if (profErr) throw new Error(`profiles badge update failed: ${profErr.message}`);
}

// Resolve the Supabase user for a subscription event: mapping table first,
// then the metadata stamped onto the subscription at checkout time.
async function resolveUser(customerId: string, sub: Stripe.Subscription) {
  const { data } = await admin()
    .from('billing_customers')
    .select('user_id')
    .eq('stripe_customer_id', customerId)
    .maybeSingle();
  return data?.user_id ?? sub.metadata?.supabase_user_id ?? null;
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

  // Idempotency: first delivery inserts the event id; replays insert nothing
  // and are acknowledged without side effects.
  const { data: fresh, error: logErr } = await admin()
    .from('stripe_events')
    .upsert({ id: event.id, type: event.type }, { onConflict: 'id', ignoreDuplicates: true })
    .select('id');
  if (logErr) {
    console.error('Event log insert failed:', logErr.message);
    return json({ error: 'Event log failure' }, 500);
  }
  if (!fresh?.length) return json({ received: true, duplicate: true });

  try {
    switch (event.type) {
      case 'checkout.session.completed': {
        const session = event.data.object as Stripe.Checkout.Session;
        if (session.mode !== 'subscription') break; // one-time tips need no state
        const userId = session.client_reference_id ?? session.metadata?.supabase_user_id;
        const customerId = typeof session.customer === 'string' ? session.customer : session.customer?.id;
        const subId = typeof session.subscription === 'string' ? session.subscription : session.subscription?.id;
        if (!userId || !customerId || !subId) {
          console.error('checkout.session.completed missing linkage', { userId, customerId, subId });
          break;
        }
        const sub = await stripe.subscriptions.retrieve(subId);
        await syncSubscription({ userId, customerId, sub, eventCreated: event.created });
        break;
      }
      case 'customer.subscription.updated':
      case 'customer.subscription.deleted': {
        const sub = event.data.object as Stripe.Subscription;
        const customerId = typeof sub.customer === 'string' ? sub.customer : sub.customer.id;
        const userId = await resolveUser(customerId, sub);
        if (!userId) {
          console.error(`${event.type}: no user for customer ${customerId}`);
          break;
        }
        await syncSubscription({ userId, customerId, sub, eventCreated: event.created });
        break;
      }
      default:
        break; // unrecognised events are acknowledged, not retried
    }
  } catch (err) {
    console.error(`Handler failed for ${event.type}:`, (err as Error).message);
    // Remove the idempotency marker so Stripe's retry actually re-runs the handler.
    await admin().from('stripe_events').delete().eq('id', event.id);
    return json({ error: 'Handler failure' }, 500);
  }

  return json({ received: true });
});
