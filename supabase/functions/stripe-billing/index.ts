/**
 * stripe-billing
 *
 * Authenticated billing actions for the PLOT Supporter subscription:
 *   POST ?action=checkout  {plan: 'monthly' | 'yearly'} -> {url}  Stripe Checkout
 *   POST ?action=portal                                 -> {url}  Customer Portal
 *
 * Reuses the caller's existing Stripe customer (from billing_customers) so a
 * cancel/resubscribe never creates a duplicate customer. The Supabase user id
 * is stamped as client_reference_id and as metadata on both the session and
 * the subscription — subscription metadata survives renewals, which is what
 * the webhook falls back to if the mapping row is ever missing.
 *
 * Secrets: STRIPE_SECRET_KEY, STRIPE_PRICE_MONTHLY, STRIPE_PRICE_YEARLY.
 */
import Stripe from 'npm:stripe@17';
import { createClient } from 'npm:@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const stripe = new Stripe(Deno.env.get('STRIPE_SECRET_KEY') ?? '', {
  httpClient: Stripe.createFetchHttpClient(),
});

const SETTINGS_URL = 'https://app.theplot.tv/settings';

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });

async function authUser(req: Request) {
  const authHeader = req.headers.get('Authorization');
  if (!authHeader) return { error: json({ error: 'Unauthorized' }, 401) };
  const supabaseUser = createClient(
    Deno.env.get('SUPABASE_URL') ?? '',
    Deno.env.get('SUPABASE_ANON_KEY') ?? '',
    { global: { headers: { Authorization: authHeader } } },
  );
  const { data: { user }, error } = await supabaseUser.auth.getUser();
  if (error || !user) return { error: json({ error: 'Unauthorized' }, 401) };
  return { user };
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405);

  const { user, error } = await authUser(req);
  if (error) return error;

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
      const session = await stripe.billingPortal.sessions.create({
        customer: billing.stripe_customer_id,
        return_url: SETTINGS_URL,
      });
      return json({ url: session.url });
    } catch (err) {
      console.error('Portal session failed:', (err as Error).message);
      return json({ error: 'Could not open billing portal' }, 500);
    }
  }

  return json({ error: 'Unknown action' }, 400);
});
