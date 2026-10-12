/**
 * alert-email-unsubscribe — the link at the bottom of every streaming alert email.
 *
 * GET  ?token -> a confirmation page with an Unsubscribe button. Changes nothing:
 *               mail scanners and link previews fetch links, and a GET that
 *               unsubscribed would let them do it for the person.
 * POST ?token -> performs the unsubscribe (turns notification_preferences.
 *               streaming_email off). Also serves Gmail / Outlook one-click
 *               List-Unsubscribe-Post requests, which POST with no body.
 *
 * The token is stateless and signed (_shared/alertDelivery.js): the person, the
 * channel and an HMAC under ALERT_EMAIL_UNSUBSCRIBE_SECRET. A guessed, edited or
 * foreign token verifies to nothing. It is deliberately separate from the weekly
 * digest's unsubscribe (newsletter-subscribe): alert email and the digest are two
 * consents, and this link only ever turns off alert email.
 *
 * It works whatever the person's plan, and with delivery off. Withdrawing
 * consent is never gated.
 *
 * Supabase serves anything from a *.supabase.co function as text/plain with a
 * sandbox policy, so the pages below are only fully readable by a machine (a
 * one-click POST, or a script). The link a PERSON clicks in the email therefore
 * goes to a real page on the web app (/email/unsubscribe), which POSTs here;
 * this endpoint answers it with CORS and plain statuses. The same flaw exists on
 * the weekly digest's unsubscribe link (newsletter-subscribe).
 *
 * Deploy with verify_jwt = false (supabase/config.toml): the link is opened from
 * an email client, with no session. Nothing is read from or reflected back out of
 * the request except the verified person id, so there is nothing to inject.
 *
 * Secrets: ALERT_EMAIL_UNSUBSCRIBE_SECRET.
 */
import { createClient } from 'npm:@supabase/supabase-js@2';
import type { Database } from '../_shared/database.types.ts';
import { serviceKey } from '../_shared/serviceKey.ts';
import { verifyUnsubscribeToken } from '../_shared/alertDelivery.js';
import { MANAGE_URL } from '../_shared/alertEmail.js';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;

// The page on the web app calls this with fetch(), so its response must be
// readable cross-origin. Safe to allow any origin: no cookies or credentials are
// involved, and the signed token is the only authority.
const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
};

// Fixed pages: no request data is ever written into them.
const page = (body: string, status = 200) =>
  new Response(
    `<!DOCTYPE html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
    <meta name="robots" content="noindex">
    <title>plot</title>
    <style>
      body { font-family: 'DM Sans', system-ui, sans-serif; background: #F8F2EA; color: #292924;
             display: flex; align-items: center; justify-content: center; min-height: 100vh; margin: 0; }
      .box { background: #FFFCF7; border: 1px solid rgba(41,41,36,0.08); border-radius: 16px; padding: 36px; max-width: 420px; text-align: center; }
      h1 { font-size: 1.2rem; margin: 0 0 10px; }
      p { color: #5F5A52; font-size: 0.95rem; line-height: 1.5; }
      a { color: #B83558; }
      button { background: #FF88C8; color: #292924; border: none; border-radius: 9999px;
               padding: 12px 28px; font-size: 1rem; font-weight: 600; cursor: pointer; margin-top: 14px; }
    </style></head><body><div class="box">${body}</div></body></html>`,
    {
      status,
      headers: {
        ...CORS,
        'Content-Type': 'text/html; charset=utf-8',
        'Cache-Control': 'no-store',
        'X-Content-Type-Options': 'nosniff',
        'Referrer-Policy': 'no-referrer',
        // No scripts at all; the button is a plain form.
        'Content-Security-Policy': "default-src 'none'; style-src 'unsafe-inline'; form-action 'self'; base-uri 'none'; frame-ancestors 'none'",
      },
    },
  );

const done = () => page(`<h1>Unsubscribed</h1>
  <p>You will not get streaming alert emails from plot. Alerts still arrive in the app, and you can turn emails back on any time in <a href="${MANAGE_URL}">Settings</a>.</p>`);

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: CORS });
  const secret = Deno.env.get('ALERT_EMAIL_UNSUBSCRIBE_SECRET');
  if (!secret) return page('<h1>Something went wrong</h1><p>Please try again later.</p>', 500);

  const token = new URL(req.url).searchParams.get('token');
  const who = await verifyUnsubscribeToken(secret, token);
  if (!who) return page('<h1>This link is not valid</h1><p>It may be incomplete or out of date. You can turn email alerts off in Settings.</p>', 404);

  if (req.method === 'GET' || req.method === 'HEAD') {
    return page(`<h1>Stop streaming alert emails?</h1>
      <p>You will still get alerts in the app.</p>
      <form method="post"><button type="submit">Unsubscribe</button></form>`);
  }

  if (req.method === 'POST') {
    const db = createClient<Database>(SUPABASE_URL, serviceKey());
    // No row means email was never on, which is the same outcome. An update to
    // false never trips the Premium check, so a lapsed member can always leave.
    const { error } = await db.from('notification_preferences')
      .update({ streaming_email: false, updated_at: new Date().toISOString() })
      .eq('user_id', who.userId);
    if (error) {
      console.error('alert-email-unsubscribe: update failed:', error.message);
      return page('<h1>Something went wrong</h1><p>Please try again, or turn email alerts off in Settings.</p>', 500);
    }
    return done();
  }

  return page('<h1>Method not allowed</h1>', 405);
});
