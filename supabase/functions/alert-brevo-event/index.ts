/**
 * alert-brevo-event
 *
 * POST { event, title, title_id, media_type }
 *   event is streaming_alert_set or episode_alert_set
 *   → { ok: true }
 *
 * Called after the streaming prompt or the episode-alerts toast has already
 * written the alert. The account email comes from the JWT. title_url is built
 * here as the app.theplot.tv/save link for that title. A client-supplied
 * title_url is ignored.
 *
 * Brevo body:
 *   event_name: streaming_alert_set | episode_alert_set
 *   identifiers.email_id: the account email
 *   event_properties: { title, title_id, media_type, title_url }
 *
 * streaming_alert_set is movie only. episode_alert_set is tv only.
 *
 * verify_jwt is true. Signed-out callers never set these alerts.
 *
 * Deploy:
 *   BREVO_API_KEY is the existing project secret. Confirm it is set.
 *   supabase functions deploy alert-brevo-event
 *   The two event names do not need a Brevo list. Brevo records them on the
 *   contact when the POST succeeds.
 */
import { createClient } from 'npm:@supabase/supabase-js@2';
import {
  normaliseAccountEmail,
  parseAlertEvent,
  postAlertBrevoEvent,
  rateLimitHit,
} from '../_shared/alertBrevoEvent.ts';

const WINDOW_MS = 60 * 60 * 1000;
const MAX_HITS = 30;
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

async function accountEmail(authHeader: string): Promise<string | null> {
  const url = Deno.env.get('SUPABASE_URL');
  const anon = Deno.env.get('SUPABASE_ANON_KEY');
  if (!authHeader || !url || !anon) return null;
  const client = createClient(url, anon, {
    global: { headers: { Authorization: authHeader } },
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data, error } = await client.auth.getUser();
  if (error || !data.user) return null;
  return normaliseAccountEmail(data.user.email);
}

Deno.serve(async (req) => {
  const origin = req.headers.get('Origin');
  if (req.method === 'OPTIONS') return new Response(null, { headers: cors(origin) });
  if (req.method !== 'POST') return json({ error: 'unavailable' }, origin, 405);

  const email = await accountEmail(req.headers.get('Authorization') ?? '');
  if (!email) return json({ error: 'unavailable' }, origin, 401);

  if (rateLimitHit(hits, email, Date.now(), WINDOW_MS, MAX_HITS)) {
    return json({ error: 'unavailable' }, origin, 429);
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return json({ error: 'unavailable' }, origin, 400);
  }

  const parsed = parseAlertEvent(body);
  if (!parsed.ok) return json({ error: 'unavailable' }, origin, 400);

  const apiKey = Deno.env.get('BREVO_API_KEY');
  if (!apiKey) {
    console.error('alert-brevo-event BREVO_API_KEY is not configured');
    return json({ error: 'unavailable' }, origin, 503);
  }

  const result = await postAlertBrevoEvent({
    fetchImpl: fetch,
    apiKey,
    email,
    eventName: parsed.eventName,
    properties: parsed.properties,
  });
  if (!result.ok) {
    console.error('alert-brevo-event brevo failed');
    return json({ error: 'unavailable' }, origin, 503);
  }
  return json({ ok: true }, origin);
});
