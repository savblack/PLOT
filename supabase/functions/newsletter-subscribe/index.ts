/**
 * newsletter-subscribe
 *
 * POST {email, website?, list?, source?}
 *                                -> subscribe (honeypot field 'website' must be empty).
 *                                  `list: 'mobile-app'` routes to the launch
 *                                  waitlist; anything else to the newsletter,
 *                                  which writes a 'pending' row and emails a
 *                                  confirmation link (double opt-in, see
 *                                  _shared/newsletterConfirm.ts). `source` tags
 *                                  where a waitlist signup came from. Always
 *                                  returns ok — no address enumeration.
 * GET  ?action=confirm&token     -> redirects to the web app's confirm page
 *                                  (never confirms: mail scanners prefetch links).
 * POST ?action=confirm&token     -> confirms: the row becomes 'active' and joins
 *                                  the Brevo marketing list. 404 for an unknown
 *                                  or used link, 410 for an expired one.
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
 *   NEWSLETTER_APP_ORIGIN     - where the GET redirects and the confirmation
 *                               link send people (default
 *                               https://app.theplot.tv; set on Staging)
 *
 * The confirmation email goes out through Resend (RESEND_API_KEY), then Brevo
 * (BREVO_API_KEY) if Resend fails, from hello@theplot.tv: the same pair
 * signup-bypass uses.
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
import { upsertBrevoContact, removeContactFromList, sendBrevoTransactionalEmail } from '../_shared/brevo.ts';
import {
  confirmMail,
  confirmState,
  confirmUrl,
  newConfirmToken,
  reusableToken,
  subscribeAction,
} from '../_shared/newsletterConfirm.ts';
import { serviceKey } from '../_shared/serviceKey.ts';
import { errorText, reportLog } from '../_shared/posthogLog.ts';
import { usableRateCount } from '../_shared/securityGuards.js';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, GET, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
};

const APP_ORIGIN = 'https://app.theplot.tv';
const appOrigin = () => (Deno.env.get('NEWSLETTER_APP_ORIGIN') || APP_ORIGIN).replace(/\/+$/, '');

const RESEND_API_URL = 'https://api.resend.com/emails';
const CONFIRM_SENDER = { name: 'Plot', email: 'hello@theplot.tv' };

/**
 * Resend first, then Brevo, as signup-bypass does. Returns whether either
 * accepted the message. Logs provider names and statuses only, never the
 * address or the link.
 */
async function sendConfirmEmail(email: string, link: string): Promise<boolean> {
  const mail = confirmMail(link);
  const resendKey = Deno.env.get('RESEND_API_KEY')?.trim();
  if (resendKey) {
    try {
      const res = await fetch(RESEND_API_URL, {
        method: 'POST',
        headers: { Authorization: `Bearer ${resendKey}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          from: `${CONFIRM_SENDER.name} <${CONFIRM_SENDER.email}>`,
          to: [email],
          subject: mail.subject,
          text: mail.text,
        }),
      });
      await res.body?.cancel();
      if (res.ok) return true;
      reportLog('newsletter-subscribe', 'error', `Confirmation email via Resend failed (${res.status})`);
    } catch (error) {
      reportLog('newsletter-subscribe', 'error', `Confirmation email via Resend failed: ${errorText(error)}`);
    }
  }
  const brevoKey = Deno.env.get('BREVO_API_KEY')?.trim();
  if (brevoKey) {
    try {
      await sendBrevoTransactionalEmail({ apiKey: brevoKey, sender: CONFIRM_SENDER, to: email, subject: mail.subject, text: mail.text });
      return true;
    } catch (error) {
      reportLog('newsletter-subscribe', 'error', `Confirmation email via Brevo failed: ${errorText(error)}`);
    }
  }
  return false;
}

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
      const origin = appOrigin();
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
      // An unclicked confirmation link must not undo this unsubscribe.
      .update({ status: 'unsubscribed', unsubscribed_at: new Date().toISOString(), confirm_token: null })
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

  // ── Confirm flow (double opt-in) ──
  if (url.searchParams.get('action') === 'confirm') {
    const token = url.searchParams.get('token') ?? '';

    // Same rule as unsubscribe: a GET only redirects, because mail scanners and
    // link previews open every link. Only the page's button confirms.
    if (req.method === 'GET') {
      const target = token ? confirmUrl(appOrigin(), token) : `${appOrigin()}/newsletter/confirm`;
      return new Response(null, { status: 302, headers: { Location: target, ...CORS } });
    }
    if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405);
    if (!token) return json({ error: 'Missing token' }, 400);

    const { data: sub } = await supabase
      .from('marketing_subscribers')
      .select('id, email, status, confirm_token, confirm_sent_at')
      .eq('confirm_token', token)
      .maybeSingle();
    const state = confirmState(sub);
    if (!sub || state === 'invalid') return json({ error: 'Link not valid' }, 404);
    if (state === 'expired') return json({ error: 'Link expired' }, 410);

    const { data: confirmed, error: confirmError } = await supabase
      .from('marketing_subscribers')
      .update({
        status: 'active',
        consented_at: new Date().toISOString(),
        unsubscribed_at: null,
        confirm_token: null,
      })
      .eq('id', sub.id)
      .eq('confirm_token', token)
      .in('status', ['pending', 'unsubscribed'])
      .select('id');
    if (confirmError) {
      reportLog('newsletter-subscribe', 'error', `Confirm failed: ${confirmError.message}`);
      return json({ error: 'Something went wrong' }, 500);
    }
    // Another click, or a bounce, changed the row since it was read.
    if (!confirmed?.length) return json({ error: 'Link not valid' }, 404);

    // Only now does the address join the marketing list.
    const brevoKey = Deno.env.get('BREVO_API_KEY');
    const brevoMarketingListId = Deno.env.get('BREVO_MARKETING_LIST_ID');
    if (brevoKey && brevoMarketingListId && sub.email) {
      try {
        await upsertBrevoContact({
          apiKey: brevoKey,
          email: sub.email,
          attributes: { OPT_IN: true },
          listIds: [Number(brevoMarketingListId)],
        });
      } catch (error) {
        reportLog('newsletter-subscribe', 'error', `Failed to sync confirmation to Brevo: ${errorText(error)}`);
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

  // Double opt-in. Nothing is marked active or sent to Brevo here: the address
  // gets one confirmation email and joins only when its owner opens the link.
  // The answer is { ok: true } whether the address was new, pending, already
  // subscribed or skipped, so this cannot be used to look addresses up.
  const { data: existing, error: readError } = await supabase
    .from('marketing_subscribers')
    .select('id, status, confirm_token, confirm_sent_at')
    .eq('email', email)
    .maybeSingle();
  if (readError) {
    reportLog('newsletter-subscribe', 'error', `Subscribe lookup failed: ${readError.message}`);
    return json({ error: 'Something went wrong' }, 500);
  }

  const action = subscribeAction(existing);
  if (action === 'skip') return json({ ok: true });

  const token = reusableToken(existing) ?? newConfirmToken();
  const sentAt = new Date().toISOString();
  // Each write claims the send: it only changes a row if nobody else claimed
  // it first, so two submits at the same moment send one email with one token.
  let claimed = false;
  if (action === 'create') {
    const { data, error } = await supabase
      .from('marketing_subscribers')
      .upsert(
        { email, status: 'pending', confirm_token: token, confirm_sent_at: sentAt },
        { onConflict: 'email', ignoreDuplicates: true },
      )
      .select('id');
    if (error) {
      reportLog('newsletter-subscribe', 'error', `Subscribe failed: ${error.message}`);
      return json({ error: 'Something went wrong' }, 500);
    }
    claimed = (data?.length ?? 0) > 0;
  } else {
    // Pending or unsubscribed. The status is left alone: an unsubscribed row
    // stays unsubscribed until the link is opened. Conditional on the
    // confirm_sent_at this request read, which is the hourly resend gate.
    let update = supabase
      .from('marketing_subscribers')
      .update({ confirm_token: token, confirm_sent_at: sentAt })
      .eq('id', existing!.id)
      .in('status', ['pending', 'unsubscribed']);
    update = existing!.confirm_sent_at
      ? update.eq('confirm_sent_at', existing!.confirm_sent_at)
      : update.is('confirm_sent_at', null);
    const { data, error } = await update.select('id');
    if (error) {
      reportLog('newsletter-subscribe', 'error', `Subscribe failed: ${error.message}`);
      return json({ error: 'Something went wrong' }, 500);
    }
    claimed = (data?.length ?? 0) > 0;
  }
  if (!claimed) return json({ ok: true });

  // The email goes out after the response, so a new address and an existing
  // one get the same answer in the same time, and a provider outage cannot
  // tell anyone which addresses are new. A failed send clears the gate so the
  // next submit tries again at once.
  const deliver = (async () => {
    const sent = await sendConfirmEmail(email, confirmUrl(appOrigin(), token));
    if (!sent) {
      await supabase.from('marketing_subscribers')
        .update({ confirm_sent_at: null })
        .eq('email', email)
        .eq('confirm_token', token);
    }
  })();
  const runtime = (globalThis as { EdgeRuntime?: { waitUntil(p: Promise<unknown>): void } }).EdgeRuntime;
  if (runtime) runtime.waitUntil(deliver);
  else await deliver;

  return json({ ok: true });
});
