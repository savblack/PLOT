/**
 * newsletter-subscribe
 *
 * POST {email, website?, list?, source?}
 *                                -> subscribe (honeypot field 'website' must be empty).
 *                                  `list: 'mobile-app'` routes to the launch
 *                                  waitlist; anything else to the newsletter.
 *                                  `source` tags where a waitlist signup came
 *                                  from. Always returns ok — no address enumeration.
 * GET  ?action=unsubscribe&token -> redirects to the web app's unsubscribe page
 *                                  (never unsubscribes: mail scanners prefetch
 *                                  links). Supabase serves function responses as
 *                                  text/plain under a sandbox CSP, so the function
 *                                  cannot show a page itself; this only rescues
 *                                  links in digests sent before the email linked
 *                                  to the page directly.
 * POST ?action=unsubscribe&token -> performs the unsubscribe and answers JSON with
 *                                  CORS, so the web page can read the result. Also
 *                                  serves Gmail/Outlook one-click List-Unsubscribe
 *                                  POSTs.
 *
 * Deploy with --no-verify-jwt (public website form + email clients call this).
 *
 * Optional env:
 *   NEWSLETTER_APP_ORIGIN     - where the GET redirect sends people (default
 *                               https://app.theplot.tv; set on Staging)
 *
 * Optional secrets (best-effort Brevo sync, skipped entirely if unset):
 *   BREVO_API_KEY             - Brevo API key
 *   BREVO_MARKETING_LIST_ID   - Brevo "PLOT Marketing Subscribers" list id
 *   BREVO_WAITLIST_LIST_ID    - Brevo "PLOT Waitlist" list id
 *
 * The WAITLIST_SOURCE attribute must exist in Brevo before it will persist —
 * Brevo silently drops unrecognized attribute keys. `marketing/setup/brevo-sync.mjs`
 * creates it (and all three lists); run that once before relying on this.
 */
import { createClient, type SupabaseClient } from 'npm:@supabase/supabase-js@2';
import type { Database } from '../_shared/database.types.ts';
import { upsertBrevoContact, removeContactFromList } from '../_shared/brevo.ts';
import { serviceKey } from '../_shared/serviceKey.ts';
import { errorText, reportLog } from '../_shared/posthogLog.ts';
import { usableRateCount } from '../_shared/securityGuards.js';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, GET, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
};

const APP_ORIGIN = 'https://app.theplot.tv';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

// `app_waitlist.source` records which form an address arrived through, so the
// launch email can be segmented (website hero vs the app's maintenance splash).
// It is caller-supplied and lands in both our table and a Brevo attribute, so
// constrain it to a slug rather than storing arbitrary text. Anything else
// falls back to the column's own default.
const SOURCE_RE = /^[a-z0-9-]{1,32}$/;
const waitlistSource = (raw?: string): string => {
  const source = String(raw ?? '').trim().toLowerCase();
  return SOURCE_RE.test(source) ? source : 'website';
};

// Per-IP and global throttle on subscribe POSTs. DB-backed and atomic via the
// auth_note_fail RPC (supabase/migrations/20260728000000_auth_fail_attempts.sql),
// shared with signup-bypass and media-sync under their own scopes. The earlier
// in-memory Map here was per isolate: Supabase spreads a burst across isolates
// with independent counters, so 400 concurrent subscribes all passed (the same
// finding signup-bypass records). Subscribing an address here adds it to a
// Brevo list that then mails it, so bulk injection is a real cost to third
// parties, not just to us. Not applied to the unsubscribe flow.
//
// The global bucket caps what any number of addresses can do in an hour. A
// legitimate day is a handful of signups; a launch spike is tens, not hundreds.
const RATE_SCOPE = 'newsletter-subscribe';
const RATE_WINDOW_MS = 60 * 60 * 1000; // 1 hour
const RATE_MAX_PER_IP = 10;
const RATE_MAX_GLOBAL = 300;
// Only accept a platform-provided connection header. `X-Forwarded-For` is
// caller controlled when this public Edge Function is invoked directly.
// No header means no per-IP bucket, so every caller would share one and the
// limit would either fail open (keyed on a constant) or lock everyone out at
// once. Returning null makes the caller refuse the request instead.
const clientIp = (req: Request): string | null => req.headers.get('cf-connecting-ip') || null;
/**
 * true = over a limit, false = allowed, null = the limiter itself failed (the
 * caller answers 503 rather than letting an outage of the limiter open the gate).
 */
async function subscribeRateLimited(
  supabase: SupabaseClient<Database>,
  ip: string,
): Promise<boolean | null> {
  const [perIp, global] = await Promise.all([
    supabase.rpc('auth_note_fail', { p_scope: RATE_SCOPE, p_ip: ip, p_window_ms: RATE_WINDOW_MS }),
    supabase.rpc('auth_note_fail', { p_scope: `${RATE_SCOPE}-all`, p_ip: 'global', p_window_ms: RATE_WINDOW_MS }),
  ]);
  const ipCount = usableRateCount(perIp);
  const globalCount = usableRateCount(global);
  if (ipCount === null || globalCount === null) {
    reportLog('newsletter-subscribe', 'error', `Newsletter rate check failed: ${errorText(perIp.error ?? global.error ?? 'invalid attempt count')}`);
    return null;
  }
  return ipCount > RATE_MAX_PER_IP || globalCount > RATE_MAX_GLOBAL;
}

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', ...CORS },
  });

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: CORS });

  const supabase = createClient<Database>(
    Deno.env.get('SUPABASE_URL')!,
    serviceKey(),
  );

  const url = new URL(req.url);

  // ── Unsubscribe flow ──
  if (url.searchParams.get('action') === 'unsubscribe') {
    const token = url.searchParams.get('token') ?? '';

    // A GET only ever redirects. It must never change anything: mail scanners
    // and link previews open every link in an email.
    if (req.method === 'GET') {
      const origin = (Deno.env.get('NEWSLETTER_APP_ORIGIN') || APP_ORIGIN).replace(/\/+$/, '');
      const target = `${origin}/newsletter/unsubscribe${token ? `?token=${encodeURIComponent(token)}` : ''}`;
      return new Response(null, { status: 302, headers: { Location: target, ...CORS } });
    }
    if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405);

    if (!token) return json({ error: 'Missing token' }, 400);

    const { data: sub } = await supabase
      .from('marketing_subscribers')
      .select('id, status, email')
      .eq('unsubscribe_token', token)
      .maybeSingle();
    if (!sub) return json({ error: 'Link not valid' }, 404);

    await supabase
      .from('marketing_subscribers')
      .update({ status: 'unsubscribed', unsubscribed_at: new Date().toISOString() })
      .eq('id', sub.id);

    const brevoKey = Deno.env.get('BREVO_API_KEY');
    const brevoMarketingListId = Deno.env.get('BREVO_MARKETING_LIST_ID');
    if (brevoKey && brevoMarketingListId && sub.email) {
      try {
        await upsertBrevoContact({ apiKey: brevoKey, email: sub.email, attributes: { OPT_IN: false } });
        await removeContactFromList({ apiKey: brevoKey, listId: Number(brevoMarketingListId), email: sub.email });
      } catch (error) {
        reportLog('newsletter-subscribe', 'error', `Failed to sync unsubscribe to Brevo: ${errorText(error)}`);
      }
    }
    return json({ ok: true });
  }

  // ── Subscribe flow ──
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405);

  const ip = clientIp(req);
  if (!ip) {
    reportLog('newsletter-subscribe', 'error', '[newsletter-subscribe] no cf-connecting-ip header; refusing rather than sharing one rate bucket');
    return json({ error: 'Something went wrong' }, 503);
  }
  const limited = await subscribeRateLimited(supabase, ip);
  if (limited === null) return json({ error: 'Something went wrong' }, 503);
  if (limited) {
    return new Response(JSON.stringify({ error: 'Too many requests' }), {
      status: 429,
      headers: { 'Content-Type': 'application/json', 'Retry-After': '3600', ...CORS },
    });
  }

  let body: { email?: string; website?: string; list?: string; source?: string };
  try {
    body = await req.json();
  } catch {
    return json({ error: 'Invalid JSON' }, 400);
  }

  // Honeypot: bots fill the hidden 'website' field. Pretend success.
  if (body.website) return json({ ok: true });

  const email = String(body.email ?? '').trim().toLowerCase();
  if (!EMAIL_RE.test(email) || email.length > 254) return json({ error: 'Invalid email' }, 400);

  // The mobile-app "notify me" form routes to a separate waitlist so those
  // signups can be emailed at launch independently of the weekly digest.
  if (body.list === 'mobile-app') {
    const { error } = await supabase
      .from('app_waitlist')
      .upsert({ email, source: waitlistSource(body.source) }, { onConflict: 'email', ignoreDuplicates: true });
    if (error) {
      reportLog('newsletter-subscribe', 'error', `Waitlist failed: ${error.message}`);
      return json({ error: 'Something went wrong' }, 500);
    }

    // Sync to Brevo so the waitlist is actually reachable. Without this the
    // addresses only ever exist in a table with no sending path attached.
    // Its own list, not the marketing one: joining the waitlist is consent to
    // hear about the launch, not to receive the weekly digest. OPT_IN is
    // deliberately not written here for the same reason — it belongs to the
    // newsletter's own opt-in flow, and someone who unsubscribed from the
    // digest may still legitimately want the launch email.
    const brevoKey = Deno.env.get('BREVO_API_KEY');
    const brevoWaitlistListId = Deno.env.get('BREVO_WAITLIST_LIST_ID');
    if (brevoKey && brevoWaitlistListId) {
      try {
        // ignoreDuplicates leaves an existing row untouched, so read the stored
        // source back rather than echoing this request's — otherwise Brevo would
        // record where someone signed up the *second* time, disagreeing with our
        // own table. Same reasoning as the status re-read in the newsletter path.
        const { data: current } = await supabase
          .from('app_waitlist')
          .select('source')
          .eq('email', email)
          .maybeSingle();
        await upsertBrevoContact({
          apiKey: brevoKey,
          email,
          attributes: { WAITLIST_SOURCE: current?.source ?? 'website' },
          listIds: [Number(brevoWaitlistListId)],
        });
      } catch (error) {
        reportLog('newsletter-subscribe', 'error', `Failed to sync waitlist signup to Brevo: ${errorText(error)}`);
      }
    }

    return json({ ok: true });
  }

  // Preserve an unsubscribe decision. A fresh opt-in flow is required before a
  // previously unsubscribed address may become active again.
  const { error } = await supabase
    .from('marketing_subscribers')
    .upsert({ email, status: 'active' }, { onConflict: 'email', ignoreDuplicates: true });
  if (error) {
    reportLog('newsletter-subscribe', 'error', `Subscribe failed: ${error.message}`);
    return json({ error: 'Something went wrong' }, 500);
  }

  const brevoKey = Deno.env.get('BREVO_API_KEY');
  const brevoMarketingListId = Deno.env.get('BREVO_MARKETING_LIST_ID');
  if (brevoKey && brevoMarketingListId) {
    try {
      // ignoreDuplicates means a previously-unsubscribed row is left
      // untouched by the upsert above — re-read the actual status so a
      // resubmit never incorrectly flips someone's Brevo OPT_IN to true.
      const { data: current } = await supabase
        .from('marketing_subscribers')
        .select('status')
        .eq('email', email)
        .maybeSingle();
      const optedIn = current?.status === 'active';
      await upsertBrevoContact({
        apiKey: brevoKey,
        email,
        attributes: { OPT_IN: optedIn },
        listIds: optedIn ? [Number(brevoMarketingListId)] : undefined,
      });
    } catch (error) {
      reportLog('newsletter-subscribe', 'error', `Failed to sync subscribe to Brevo: ${errorText(error)}`);
    }
  }

  return json({ ok: true });
});
