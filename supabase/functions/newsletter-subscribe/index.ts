/**
 * newsletter-subscribe
 *
 * POST {email, website?}        -> subscribe (honeypot field 'website' must be empty).
 *                                  Always returns ok — no address enumeration.
 * GET  ?action=unsubscribe&token -> confirmation page with an unsubscribe button.
 * POST ?action=unsubscribe&token -> performs the unsubscribe. Also serves Gmail/
 *                                  Outlook one-click List-Unsubscribe POSTs.
 *
 * Deploy with --no-verify-jwt (public website form + email clients call this).
 */
import { createClient } from 'npm:@supabase/supabase-js@2';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, GET, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
};

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

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
      .select('id, status')
      .eq('unsubscribe_token', token)
      .maybeSingle();
    if (!sub) return page('PLOT', '<h1>Link not valid</h1>', 404);

    if (req.method === 'GET') {
      if (sub.status === 'unsubscribed') {
        return page('PLOT', '<h1>Unsubscribed</h1><p>You will not receive the PLOT digest again.</p>');
      }
      return page('PLOT — unsubscribe', `
        <h1>Unsubscribe from the PLOT weekly digest?</h1>
        <button onclick="fetch(location.href,{method:'POST'}).then(()=>location.reload())">Unsubscribe</button>`);
    }

    if (req.method === 'POST') {
      await supabase
        .from('marketing_subscribers')
        .update({ status: 'unsubscribed', unsubscribed_at: new Date().toISOString() })
        .eq('id', sub.id);
      return page('PLOT', '<h1>Unsubscribed</h1><p>You will not receive the PLOT digest again.</p>');
    }
    return page('PLOT', '<h1>Method not allowed</h1>', 405);
  }

  // ── Subscribe flow ──
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405);

  let body: { email?: string; website?: string; list?: string };
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
      .upsert({ email }, { onConflict: 'email', ignoreDuplicates: true });
    if (error) {
      console.error('Waitlist failed:', error.message);
      return json({ error: 'Something went wrong' }, 500);
    }
    return json({ ok: true });
  }

  // Newsletter — re-subscribing flips a previously unsubscribed address back to active.
  const { error } = await supabase
    .from('marketing_subscribers')
    .upsert(
      { email, status: 'active', unsubscribed_at: null },
      { onConflict: 'email' },
    );
  if (error) {
    console.error('Subscribe failed:', error.message);
    return json({ error: 'Something went wrong' }, 500);
  }

  return json({ ok: true });
});
