// Runs for every request to app.theplot.tv (Cloudflare Pages Functions
// middleware). Two jobs:
//  1. noindex any deployment that isn't app.theplot.tv — the per-branch
//     *.pages.dev previews. They also sit behind Cloudflare Access, so this
//     is defence in depth rather than the only guard.
//  2. Set a per-request Content-Security-Policy with a fresh script-src nonce
//     instead of 'unsafe-inline', and stamp that nonce onto the page's own
//     inline <script> tags so they still run. Keep the allow-lists below in
//     sync with apps/web/src and functions/*.js — this replaces the static
//     CSP line that used to live in apps/web/public/_headers.
const CSP = (nonce) => [
  "default-src 'self'",
  "base-uri 'self'",
  "object-src 'none'",
  "frame-ancestors 'none'",
  "img-src 'self' data: blob: https://image.tmdb.org https://static.tvmaze.com https://mkegtssedjyqldysvzga.supabase.co https://uzrhfivnhdcfieuaxzip.supabase.co https://a.theplot.tv https://storage.ko-fi.com",
  "style-src 'self' 'unsafe-inline'",
  "font-src 'self'",
  `script-src 'self' 'nonce-${nonce}' https://a.theplot.tv https://challenges.cloudflare.com`,
  "connect-src 'self' https://mkegtssedjyqldysvzga.supabase.co wss://mkegtssedjyqldysvzga.supabase.co https://uzrhfivnhdcfieuaxzip.supabase.co wss://uzrhfivnhdcfieuaxzip.supabase.co https://tmdb-proxy.sav-black.workers.dev https://tmdb-proxy-staging.sav-black.workers.dev https://api.tvmaze.com https://a.theplot.tv https://challenges.cloudflare.com",
  "frame-src https://challenges.cloudflare.com https://www.youtube.com https://www.youtube-nocookie.com",
  "worker-src 'self' blob:",
  "form-action 'self'",
  'upgrade-insecure-requests',
].join('; ');

function randomNonce() {
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  let bin = '';
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin);
}

// Stamp the nonce onto inline scripts only — external `src=` scripts are
// already covered by script-src's host allow-list, and non-JS <script>
// blocks (e.g. type="application/ld+json") aren't executed so CSP doesn't
// gate them; leaving them alone avoids an invalid/no-op attribute.
class ScriptNoncer {
  constructor(nonce) {
    this.nonce = nonce;
  }
  element(el) {
    if (el.getAttribute('src')) return;
    const type = el.getAttribute('type');
    if (type && type !== 'text/javascript' && type !== 'module') return;
    el.setAttribute('nonce', this.nonce);
  }
}

export async function onRequest(context) {
  const response = await context.next();
  const { hostname } = new URL(context.request.url);
  // Was `hostname === 'preview.theplot.tv'` until that host was retired on
  // 2026-09-06. Asking whether this IS production covers every current and
  // future non-production host instead of naming them one at a time.
  const isPreview = hostname !== 'app.theplot.tv';
  const contentType = response.headers.get('content-type') || '';

  if (!contentType.includes('text/html')) {
    if (!isPreview) return response;
    const headers = new Headers(response.headers);
    headers.set('X-Robots-Tag', 'noindex, nofollow');
    return new Response(response.body, { status: response.status, statusText: response.statusText, headers });
  }

  const nonce = randomNonce();
  const headers = new Headers(response.headers);
  headers.set('Content-Security-Policy', CSP(nonce));
  // Every execution stamps a fresh nonce onto this exact response body — a
  // cached/revalidated copy would pair yesterday's stamped nonce with
  // today's header nonce and get its inline scripts blocked. Never let this
  // response be cached or reused.
  headers.set('Cache-Control', 'no-store');
  if (isPreview) headers.set('X-Robots-Tag', 'noindex, nofollow');

  const rewritten = new Response(response.body, { status: response.status, statusText: response.statusText, headers });
  return new HTMLRewriter().on('script', new ScriptNoncer(nonce)).transform(rewritten);
}
