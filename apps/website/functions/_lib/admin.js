// admin.theplot.tv — proxy to the `admin-review` Edge Function, re-served as HTML.
// Port of apps/website/api/admin.mjs. Forwards GET and POST (form submits), the
// auth cookie and ?view, the real client IP, and relays Set-Cookie back so the
// admin session cookie is stored. Auth is cookie-only; ?key= is intentionally
// NOT forwarded so the secret never lands in a URL / proxy log.
import { SUPABASE_FN, ANON_KEY } from './proxy.js';

const UPSTREAM = `${SUPABASE_FN}/admin-review`;

export async function admin(request) {
  const reqUrl = new URL(request.url);
  const url = new URL(UPSTREAM);

  let view = reqUrl.searchParams.get('view');
  let body;
  if (request.method === 'POST') {
    // Read the submitted form and re-encode as x-www-form-urlencoded.
    const form = await request.formData();
    if (!view) view = form.get('view');
    const enc = new URLSearchParams();
    for (const [k, v] of form) enc.append(k, typeof v === 'string' ? v : '');
    body = enc.toString();
  }
  if (view) url.searchParams.set('view', view);

  const headers = { Authorization: `Bearer ${ANON_KEY}`, apikey: ANON_KEY };
  // Pass the real client IP through so the upstream's per-IP throttle sees the
  // caller, not Cloudflare's edge.
  const ip = request.headers.get('CF-Connecting-IP');
  if (ip) headers['x-forwarded-for'] = ip;
  const cookie = request.headers.get('cookie');
  if (cookie) headers.cookie = cookie;
  if (request.method === 'POST') headers['content-type'] = 'application/x-www-form-urlencoded';

  try {
    const up = await fetch(url, { method: request.method, headers, body });
    const text = await up.text();
    const respHeaders = new Headers({ 'content-type': 'text/html; charset=utf-8' });
    // Relay each Set-Cookie as its OWN header — a comma-joined get('set-cookie')
    // corrupts the admin_token cookie (the upstream also sets __cf_bm).
    const cookies = typeof up.headers.getSetCookie === 'function'
      ? up.headers.getSetCookie()
      : (up.headers.get('set-cookie') ? [up.headers.get('set-cookie')] : []);
    for (const c of cookies) respHeaders.append('set-cookie', c);
    return new Response(text, { status: up.status, headers: respHeaders });
  } catch {
    return new Response(
      '<!doctype html><meta charset="utf-8"><p style="font-family:sans-serif;padding:40px">Review desk is briefly unavailable.</p>',
      { status: 502, headers: { 'content-type': 'text/html; charset=utf-8' } },
    );
  }
}
