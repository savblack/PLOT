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
import { serviceKey } from '../_shared/serviceKey.ts';
import { cancelsAtPeriodEnd } from '../_shared/billingPolicy.ts';
import { reconcileBillingSnapshot } from '../_shared/billingSnapshot.ts';

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
    () => stripe.subscriptions.retrieve(sub.id),
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
    switch (event.type) {
      case 'checkout.session.completed': {
        const session = event.data.object as Stripe.Checkout.Session;
        if (session.mode !== 'subscription') break; // one-time tips need no state
        const userId = session.client_reference_id ?? session.metadata?.supabase_user_id;
        const customerId = typeof session.customer === 'string' ? session.customer : session.customer?.id;
        const subId = typeof session.subscription === 'string' ? session.subscription : session.subscription?.id;
        if (!userId || !customerId || !subId) {
          throw new Error('Checkout subscription is missing PLOT linkage');
        }
        const sub = await stripe.subscriptions.retrieve(subId);
        return json({ received: true, ...await syncSubscription({ userId, customerId, sub, event }) });
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
        return json({ received: true, ...await syncSubscription({ userId, customerId, sub, event }) });
      }
      default:
        break; // unrecognised events are acknowledged, not retried
    }
  } catch (err) {
    console.error(`Handler failed for ${event.type}:`, (err as Error).message);
    // The RPC rolls back its receipt with the failed state update. No cleanup
    // request (which could also fail) is needed before Stripe retries.
    return json({ error: 'Handler failure' }, 500);
  }

  return json({ received: true });
});
