// Serverless proxy for admin.theplot.tv — re-serves the `admin-review` Supabase
// Edge Function as real HTML (Supabase serves functions sandboxed; see
// api/whats-on.mjs for the full explanation). Forwards GET and POST (form
// submits), the auth cookie, and the ?key, and relays Set-Cookie back.
const UPSTREAM = 'https://mkegtssedjyqldysvzga.supabase.co/functions/v1/admin-review';
const ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im1rZWd0c3NlZGp5cWxkeXN2emdhIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzM2MDgzMzUsImV4cCI6MjA4OTE4NDMzNX0.W-toEr3ftNeN0iTpRQ8Ord09sxBiwO2CQC6j2jszN6w';

export default async function handler(req, res) {
  const url = new URL(UPSTREAM);
  const key = req.query?.key || req.body?.key;
  if (key) url.searchParams.set('key', Array.isArray(key) ? key[0] : key);

  const headers = { Authorization: `Bearer ${ANON_KEY}`, apikey: ANON_KEY };
  if (req.headers.cookie) headers.cookie = req.headers.cookie;

  let body;
  if (req.method === 'POST') {
    headers['content-type'] = 'application/x-www-form-urlencoded';
    body = new URLSearchParams(req.body || {}).toString();
  }

  try {
    const up = await fetch(url, { method: req.method, headers, body });
    const text = await up.text();
    res.status(up.status);
    res.setHeader('content-type', 'text/html; charset=utf-8');
    const setCookie = up.headers.get('set-cookie');
    if (setCookie) res.setHeader('set-cookie', setCookie);
    res.send(text);
  } catch {
    res.status(502).setHeader('content-type', 'text/html; charset=utf-8');
    res.send('<!doctype html><meta charset="utf-8"><p style="font-family:sans-serif;padding:40px">Review desk is briefly unavailable.</p>');
  }
}
