/**
 * newsletter-subscribe
 *
 * POST {email, website?, list?, source?}
 *                                -> subscribe (honeypot field 'website' must be empty).
 *                                  `list: 'mobile-app'` routes to the launch
 *                                  waitlist; anything else to the newsletter.
 *                                  `source` tags where a waitlist signup came
 *                                  from. Always returns ok — no address enumeration.
 * GET  ?action=unsubscribe&token -> confirmation page with an unsubscribe button.
 * POST ?action=unsubscribe&token -> performs the unsubscribe. Also serves Gmail/
 *                                  Outlook one-click List-Unsubscribe POSTs.
 *
 * Deploy with --no-verify-jwt (public website form + email clients call this).
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
import { createClient } from 'npm:@supabase/supabase-js@2';
import { upsertBrevoContact, removeContactFromList } from '../_shared/brevo.ts';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, GET, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
};

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

// Best-effort in-memory per-IP throttle on subscribe POSTs — raises the cost of
// list-pollution / bulk address injection (the honeypot only stops naive bots).
// Warm-isolate state; a burst from one IP keeps the isolate warm, which is when
// the limit matters. Not applied to the unsubscribe flow.
const SUB_WINDOW_MS = 60 * 60 * 1000; // 1 hour
const SUB_MAX = 10;                   // subscribe attempts per IP per window
const subHits = new Map<string, { count: number; first: number }>();
// Only accept a platform-provided connection header. `X-Forwarded-For` is
// caller controlled when this public Edge Function is invoked directly.
const clientIp = (req: Request): string => req.headers.get('cf-connecting-ip') || 'unknown';
function subRateLimited(ip: string): boolean {
  const now = Date.now();
  const rec = subHits.get(ip);
  if (!rec || now - rec.first > SUB_WINDOW_MS) { subHits.set(ip, { count: 1, first: now }); return false; }
  rec.count += 1;
  return rec.count > SUB_MAX;
}

const page = (title: string, body: string, status = 200) =>
  new Response(
    `<!DOCTYPE html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
    <title>${title}</title>
    <style>
      body { font-family: system-ui, sans-serif; background: #F4F4F5; color: #09090B;
             display: flex; align-items: center; justify-content: center; min-height: 100vh; margin: 0; }
      .box { background: #fff; border-radius: 16px; padding: 36px; max-width: 420px; text-align: center;
             box-shadow: 0 4px 20px rgba(0,0,0,0.08); }
      h1 { font-size: 1.2rem; margin: 0 0 10px; }
      p { color: #52525B; font-size: 0.95rem; line-height: 1.5; }
      button { background: #E05578; color: #fff; border: none; border-radius: 9999px;
               padding: 12px 28px; font-size: 1rem; font-weight: 600; cursor: pointer; margin-top: 14px; }
    </style></head><body><div class="box">${body}</div></body></html>`,
    { status, headers: { 'Content-Type': 'text/html; charset=utf-8', ...CORS } },
  );

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', ...CORS },
  });

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: CORS });

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  );

  const url = new URL(req.url);

  // ── Unsubscribe flow ──
  if (url.searchParams.get('action') === 'unsubscribe') {
    const token = url.searchParams.get('token') ?? '';
    if (!token) return page('PLOT', '<h1>Missing token</h1>', 400);

    const { data: sub } = await supabase
      .from('marketing_subscribers')
      .select('id, status, email')
      .eq('unsubscribe_token', token)
      .maybeSingle();
    if (!sub) return page('PLOT', '<h1>Link not valid</h1>', 404);

    if (req.method === 'GET') {
      if (sub.status === 'unsubscribed') {
        return page('PLOT', '<h1>Unsubscribed</h1><p>You will not receive the PLOT digest again.</p>');
      }
      return page('PLOT — unsubscribe', `
        <h1>Unsubscribe from the PLOT digest?</h1>
        <button onclick="fetch(location.href,{method:'POST'}).then(()=>location.reload())">Unsubscribe</button>`);
    }

    if (req.method === 'POST') {
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
          console.error('Failed to sync unsubscribe to Brevo:', error instanceof Error ? error.message : error);
        }
      }

      return page('PLOT', '<h1>Unsubscribed</h1><p>You will not receive the PLOT digest again.</p>');
    }
    return page('PLOT', '<h1>Method not allowed</h1>', 405);
  }

  // ── Subscribe flow ──
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405);

  if (subRateLimited(clientIp(req))) {
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
      console.error('Waitlist failed:', error.message);
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
        console.error('Failed to sync waitlist signup to Brevo:', error instanceof Error ? error.message : error);
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
    console.error('Subscribe failed:', error.message);
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
      console.error('Failed to sync subscribe to Brevo:', error instanceof Error ? error.message : error);
    }
  }

  return json({ ok: true });
});
