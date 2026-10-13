/**
 * billing-availability
 *
 * Public read of whether THIS caller may start Plot Premium checkout.
 *   POST → { checkoutAvailable: boolean }
 *
 * Signed out: true only when STRIPE_CHECKOUT_ENABLED is exactly "true".
 * Signed in: true for that account when the switch is on, or when their
 * verified user id is on the pilot list.
 *
 * The response is a boolean. It does not include the allowlist, a pilot
 * count, price ids, or any secret. verify_jwt is false so a signed-out
 * plans page can ask (the publishable key is not a JWT the gateway would
 * accept). A bearer is checked with Auth's getUser, not trusted from its claims.
 *
 * Also logs, once per isolate: `billing-availability: checkout enabled=yes|no pilotCount=N`
 */
import { createClient } from 'npm:@supabase/supabase-js@2';
import { checkoutConfigLog, mayStartCheckout } from '../_shared/billingPolicy.ts';

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

let loggedCheckoutConfig = false;
function logCheckoutConfig(enabled: string | undefined, pilotIds: string | undefined) {
  if (loggedCheckoutConfig) return;
  loggedCheckoutConfig = true;
  console.log(`billing-availability: ${checkoutConfigLog(enabled, pilotIds)}`);
}

async function userIdFrom(req: Request): Promise<string | undefined> {
  const authHeader = req.headers.get('Authorization');
  if (!authHeader) return undefined;
  const supabaseUser = createClient(
    Deno.env.get('SUPABASE_URL') ?? '',
    Deno.env.get('SUPABASE_ANON_KEY') ?? '',
    { global: { headers: { Authorization: authHeader } } },
  );
  const { data: { user }, error } = await supabaseUser.auth.getUser();
  if (error || !user) return undefined;
  return user.id;
}

Deno.serve(async (req) => {
  const headers = corsHeadersFor(req);
  const json = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), { status, headers: { ...headers, 'Content-Type': 'application/json' } });

  if (req.method === 'OPTIONS') return new Response(null, { headers });
  if (req.method !== 'GET' && req.method !== 'POST') return json({ error: 'Method not allowed' }, 405);

  const pilotIds = Deno.env.get('STRIPE_CHECKOUT_PILOT_USER_IDS');
  const checkoutEnabled = Deno.env.get('STRIPE_CHECKOUT_ENABLED');
  logCheckoutConfig(checkoutEnabled, pilotIds);

  const userId = await userIdFrom(req);
  return json({ checkoutAvailable: mayStartCheckout(userId, checkoutEnabled, pilotIds) });
});
