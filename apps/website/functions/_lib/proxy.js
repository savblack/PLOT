// Shared upstream config + helpers for the theplot.tv marketing proxies
// (Cloudflare Pages Functions port of apps/website/api/*.mjs).
//
// The marketing pages are server-rendered by Supabase Edge Functions, which
// Supabase serves from *.supabase.co as text/plain under a sandbox CSP. These
// proxies re-serve the same responses from theplot.tv with the correct content
// type and without the sandbox CSP, so browsers render them.
export const SUPABASE_FN = 'https://mkegtssedjyqldysvzga.supabase.co/functions/v1';

// Publishable key — the same one apps/website/index.html ships. Sent so pages
// keep rendering if an Edge Function is ever redeployed with verify_jwt on.
// Replaces the legacy anon JWT, which stops working when legacy API keys are
// disabled.
export const ANON_KEY = 'sb_publishable_sbB7Jrs3Uz97Xm3qiuQgOQ_7dg6kKWk';

export const AUTH_HEADERS = { apikey: ANON_KEY, authorization: `Bearer ${ANON_KEY}` };

export const htmlError = (status, body) =>
  new Response(body, {
    status,
    headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' },
  });
