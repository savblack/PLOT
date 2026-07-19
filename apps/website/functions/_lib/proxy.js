// Shared upstream config + helpers for the theplot.tv marketing proxies
// (Cloudflare Pages Functions port of apps/website/api/*.mjs).
//
// The marketing pages are server-rendered by Supabase Edge Functions, which
// Supabase serves from *.supabase.co as text/plain under a sandbox CSP. These
// proxies re-serve the same responses from theplot.tv with the correct content
// type and without the sandbox CSP, so browsers render them.
export const SUPABASE_FN = 'https://mkegtssedjyqldysvzga.supabase.co/functions/v1';

// Public, publishable anon key (role: anon) — the same key the site already
// ships in apps/website/index.html. Sent so pages keep rendering if an Edge
// Function is ever redeployed with verify_jwt on.
export const ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im1rZWd0c3NlZGp5cWxkeXN2emdhIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzM2MDgzMzUsImV4cCI6MjA4OTE4NDMzNX0.W-toEr3ftNeN0iTpRQ8Ord09sxBiwO2CQC6j2jszN6w';

export const AUTH_HEADERS = { apikey: ANON_KEY, authorization: `Bearer ${ANON_KEY}` };

export const htmlError = (status, body) =>
  new Response(body, {
    status,
    headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' },
  });
