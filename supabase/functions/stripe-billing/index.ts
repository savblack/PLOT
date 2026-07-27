/**
 * stripe-billing
 *
 * Authenticated billing actions for the PLOT Premium subscription:
 *   POST ?action=checkout  {plan: 'monthly' | 'yearly'} -> {url}  Stripe Checkout
 *   POST ?action=portal                                 -> {url}  Customer Portal
 *   POST ?action=tip       {amount: 500}                -> {url}  One-time Stripe Checkout
 *
 * Reuses the caller's existing Stripe customer (from billing_customers) so a
 * cancel/resubscribe never creates a duplicate customer. The Supabase user id
 * is stamped as client_reference_id and as metadata on both the session and
 * the subscription — subscription metadata survives renewals, which is what
 * the webhook falls back to if the mapping row is ever missing.
 *
 * Secrets: STRIPE_SECRET_KEY, STRIPE_PRICE_MONTHLY, STRIPE_PRICE_YEARLY.
 */
import Stripe from 'npm:stripe@22.3.2';
import { createClient } from 'npm:@supabase/supabase-js@2';

// Wildcard CORS was needless here — unlike newsletter-subscribe (called by
// arbitrary email clients and marketing embeds), this is only ever called
// from the app itself. Not directly exploitable given the bearer-token auth
// below, but tightened for defense-in-depth, matching watch-availability's pattern.
function allowedOrigin(origin: string | null) {
  if (!origin) return 'https://app.theplot.tv';
  try {
    const { hostname, protocol } = new URL(origin);
    if (protocol === 'http:' && (hostname === 'localhost' || hostname === '127.0.0.1')) return origin;
    if (hostname === 'theplot.tv' || hostname.endsWith('.theplot.tv') || hostname.endsWith('.vercel.app')) return origin;
  } catch { /* use canonical origin */ }
  return 'https://app.theplot.tv';
}

function corsHeadersFor(req: Request) {
  return {
    'Access-Control-Allow-Origin': allowedOrigin(req.headers.get('Origin')),
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
    'Vary': 'Origin',
  };
}

const stripe = new Stripe(Deno.env.get('STRIPE_SECRET_KEY') ?? '', {
  httpClient: Stripe.createFetchHttpClient(),
});

const SETTINGS_URL = 'https://app.theplot.tv/settings';
const TIP_MIN_AMOUNT = 100;
const TIP_MAX_AMOUNT = 50000;

async function createPortalUrl(customerId: string) {
  const session = await stripe.billingPortal.sessions.create({
    customer: customerId,
    return_url: SETTINGS_URL,
  });
  return session.url;
}

async function getAuthedUser(req: Request) {
  const authHeader = req.headers.get('Authorization');
  if (!authHeader) return { user: null };
  const supabaseUser = createClient(
    Deno.env.get('SUPABASE_URL') ?? '',
    Deno.env.get('SUPABASE_ANON_KEY') ?? '',
    { global: { headers: { Authorization: authHeader } } },
  );
  const { data: { user }, error } = await supabaseUser.auth.getUser();
  if (error || !user) return { user: null };
  return { user };
}

Deno.serve(async (req) => {
  const headers = corsHeadersFor(req);
  const json = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), { status, headers: { ...headers, 'Content-Type': 'application/json' } });

  if (req.method === 'OPTIONS') return new Response(null, { headers });
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405);

  const { user } = await getAuthedUser(req);
  if (!user) return json({ error: 'Unauthorized' }, 401);

  const admin = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  );
  const { data: billing } = await admin
    .from('billing_customers')
    .select('stripe_customer_id')
    .eq('user_id', user.id)
    .maybeSingle();

  const action = new URL(req.url).searchParams.get('action');

  if (action === 'checkout') {
    let plan = 'monthly';
    try {
      const body = await req.json();
      if (body?.plan === 'yearly') plan = 'yearly';
    } catch { /* default to monthly */ }

    const price = plan === 'yearly'
      ? Deno.env.get('STRIPE_PRICE_YEARLY')
      : Deno.env.get('STRIPE_PRICE_MONTHLY');
    if (!price) return json({ error: 'Billing is not configured' }, 500);

    try {
      // A late webhook or stale profile badge must never let someone open a
      // second subscription. Existing subscribers go straight to the portal.
      if (billing?.stripe_customer_id) {
        const subscriptions = await stripe.subscriptions.list({
          customer: billing.stripe_customer_id,
          status: 'all',
          limit: 100,
        });
        if (subscriptions.data.some((sub) => ['active', 'trialing', 'past_due'].includes(sub.status))) {
          return json({ url: await createPortalUrl(billing.stripe_customer_id) });
        }
      }

      const session = await stripe.checkout.sessions.create({
        mode: 'subscription',
        line_items: [{ price, quantity: 1 }],
        customer: billing?.stripe_customer_id ?? undefined,
        customer_email: billing?.stripe_customer_id ? undefined : user.email,
        client_reference_id: user.id,
        metadata: { supabase_user_id: user.id },
        subscription_data: { metadata: { supabase_user_id: user.id } },
        success_url: `${SETTINGS_URL}?checkout=success`,
        cancel_url: `${SETTINGS_URL}?checkout=cancelled`,
        allow_promotion_codes: true,
      });
      return json({ url: session.url });
    } catch (err) {
      console.error('Checkout session failed:', (err as Error).message);
      return json({ error: 'Could not start checkout' }, 500);
    }
  }

  if (action === 'portal') {
    if (!billing?.stripe_customer_id) return json({ error: 'No subscription found' }, 404);
    try {
      return json({ url: await createPortalUrl(billing.stripe_customer_id) });
    } catch (err) {
      console.error('Portal session failed:', (err as Error).message);
      return json({ error: 'Could not open billing portal' }, 500);
    }
  }

  if (action === 'tip') {
    let amount = 500;
    try {
      const body = await req.json();
      if (Number.isFinite(body?.amount)) amount = Math.round(Number(body.amount));
    } catch { /* default to A$5 */ }

    if (amount < TIP_MIN_AMOUNT || amount > TIP_MAX_AMOUNT) {
      return json({ error: 'Tip amount must be between A$1 and A$500' }, 400);
    }

    try {
      const session = await stripe.checkout.sessions.create({
        mode: 'payment',
        customer: billing?.stripe_customer_id ?? undefined,
        customer_email: billing?.stripe_customer_id ? undefined : user.email,
        client_reference_id: user.id,
        metadata: {
          kind: 'tip',
          supabase_user_id: user.id,
        },
        line_items: [{
          quantity: 1,
          price_data: {
            currency: 'aud',
            unit_amount: amount,
            product_data: {
              name: 'PLOT Tip',
              description: 'One-time support for PLOT',
            },
          },
        }],
        success_url: `${SETTINGS_URL}?tip=thanks`,
        cancel_url: `${SETTINGS_URL}?tip=cancelled`,
      });
      return json({ url: session.url });
    } catch (err) {
      console.error('Tip checkout session failed:', (err as Error).message);
      return json({ error: 'Could not start tip checkout' }, 500);
    }
  }

  return json({ error: 'Unknown action' }, 400);
});
