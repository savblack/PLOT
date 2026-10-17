/**
 * marketing-notify — sends one operational email with the project's Resend key.
 *
 * GitHub Actions holds its own RESEND_API_KEY. That copy went stale when the
 * Resend key was rotated on 2026-10-16. The weekly job and the failure alerts
 * call this instead, so they use the project secret signup and billing mail
 * already use.
 *
 * Auth: verify_jwt stays true, and the bearer must match SB_SECRET_KEY or
 * SUPABASE_SERVICE_ROLE_KEY. The From address is fixed. Callers do not get to
 * choose it.
 */
import { hasServiceRoleBearer } from '../_shared/internalWebhook.ts';

const FROM = 'Plot <hello@theplot.tv>';

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

Deno.serve(async (req) => {
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405);
  if (!hasServiceRoleBearer(req)) return json({ error: 'Forbidden' }, 403);

  let body: { to?: unknown; subject?: unknown; html?: unknown };
  try {
    body = await req.json();
  } catch {
    return json({ error: 'Invalid JSON' }, 400);
  }

  const to = String(body?.to ?? '').trim();
  const subject = String(body?.subject ?? '').trim();
  const html = String(body?.html ?? '');
  if (!to.includes('@') || !subject || !html) {
    return json({ error: 'to, subject, and html are required' }, 400);
  }
  if (subject.length > 200 || html.length > 100_000) {
    return json({ error: 'too large' }, 400);
  }

  const key = Deno.env.get('RESEND_API_KEY') ?? '';
  if (!key) return json({ error: 'RESEND_API_KEY is not set' }, 500);

  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ from: FROM, to: [to], subject, html }),
  });
  if (!res.ok) {
    const detail = (await res.text()).slice(0, 180);
    console.error('marketing-notify Resend failed', res.status, detail);
    return json({ error: `Resend ${res.status}` }, 502);
  }
  return json({ ok: true });
});
