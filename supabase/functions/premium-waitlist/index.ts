/**
 * premium-waitlist
 *
 * POST { gate: 'themes' | 'smart_lists', email?, website? }
 *   → { ok: true, already: boolean }
 *
 * Custom themes and Smart lists sheets call this. Checkout is not involved.
 * A signed-in caller's account email comes from their JWT and the body email
 * is ignored. A signed-out caller must send email. The address is upserted
 * onto the Brevo list "Premium waitlist" with attribute PREMIUM_INTEREST set
 * to the gate. The same gate again returns already: true.
 *
 * verify_jwt is false (supabase/config.toml) because signed-out visitors call
 * this. The function checks a user JWT itself when one is present.
 *
 * Deploy:
 *   BREVO_API_KEY is the existing project secret. newsletter-subscribe and
 *   notify-signup already read that name. Confirm it is set. Do not add a
 *   second key.
 *   Create a Brevo list named "Premium waitlist" if it is missing. Put its
 *   numeric id in the edge secret BREVO_PREMIUM_WAITLIST_LIST_ID. Brevo lists
 *   are addressed by id, not by name.
 *   Create the text contact attribute PREMIUM_INTEREST if it is missing.
 *   Brevo drops attribute keys it does not already know, and the upsert still
 *   returns success, so a missing attribute looks like a join that saved nothing.
 *   supabase functions deploy premium-waitlist
 */
import { createClient } from 'npm:@supabase/supabase-js@2';
import {
  decideWaitlistJoin,
  rateLimitHit,
  upsertPremiumWaitlistContact,
  WAITLIST_LIST_ENV,
} from '../_shared/premiumWaitlist.ts';

const WINDOW_MS = 60 * 60 * 1000;
const MAX_HITS = 10;
const hits = new Map<string, { count: number; first: number }>();

function allowedOrigin(origin: string | null) {
  if (!origin) return 'https://app.theplot.tv';
  try {
    const { hostname, protocol } = new URL(origin);
    if (protocol === 'http:' && (hostname === 'localhost' || hostname === '127.0.0.1')) return origin;
    if (hostname === 'theplot.tv' || hostname.endsWith('.theplot.tv')) return origin;
    if (protocol === 'https:' && hostname.endsWith('.plot-5wr.pages.dev')) return origin;
  } catch { /* use canonical origin */ }
  return 'https://app.theplot.tv';
}

function cors(origin: string | null) {
  return {
    'Access-Control-Allow-Origin': allowedOrigin(origin),
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Vary': 'Origin',
  };
}

function json(body: unknown, origin: string | null, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...cors(origin), 'Content-Type': 'application/json' },
  });
}

const clientIp = (req: Request) => req.headers.get('cf-connecting-ip') || 'unknown';

function premiumListId(raw: string | undefined): number | null {
  if (!raw || !/^[1-9]\d*$/.test(raw)) return null;
  const id = Number(raw);
  return Number.isSafeInteger(id) ? id : null;
}

async function accountEmail(authHeader: string): Promise<string | null> {
  const url = Deno.env.get('SUPABASE_URL');
  const anon = Deno.env.get('SUPABASE_ANON_KEY');
  if (!authHeader || !url || !anon) return null;
  const client = createClient(url, anon, {
    global: { headers: { Authorization: authHeader } },
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data, error } = await client.auth.getUser();
  if (error || !data.user?.email) return null;
  return data.user.email;
}

Deno.serve(async (req) => {
  const origin = req.headers.get('Origin');
  if (req.method === 'OPTIONS') return new Response(null, { headers: cors(origin) });
  if (req.method !== 'POST') return json({ error: 'unavailable' }, origin, 405);

  if (rateLimitHit(hits, clientIp(req), Date.now(), WINDOW_MS, MAX_HITS)) {
    return json({ error: 'unavailable' }, origin, 429);
  }

  let body: { gate?: unknown; email?: unknown; website?: unknown };
  try {
    body = await req.json();
  } catch {
    return json({ error: 'invalid_email' }, origin, 400);
  }

  if (decideWaitlistJoin({ website: body.website, gate: body.gate, email: body.email, accountEmail: null }).action === 'pretend') {
    return json({ ok: true, already: true }, origin);
  }

  const account = await accountEmail(req.headers.get('Authorization') ?? '');
  const decision = decideWaitlistJoin({
    gate: body.gate,
    email: body.email,
    accountEmail: account,
  });
  if (decision.action === 'reject') return json({ error: decision.error }, origin, decision.status);
  if (decision.action !== 'join') return json({ ok: true, already: true }, origin);

  const apiKey = Deno.env.get('BREVO_API_KEY');
  const listId = premiumListId(Deno.env.get(WAITLIST_LIST_ENV));
  if (!apiKey || listId == null) {
    console.error(`premium-waitlist Brevo is not configured (${WAITLIST_LIST_ENV})`);
    return json({ error: 'unavailable' }, origin, 503);
  }

  const result = await upsertPremiumWaitlistContact({
    fetchImpl: fetch,
    apiKey,
    email: decision.email,
    gate: decision.gate,
    listId,
  });
  if (!result.ok) {
    console.error('premium-waitlist brevo failed');
    return json({ error: 'unavailable' }, origin, 503);
  }
  return json({ ok: true, already: result.already }, origin);
});
