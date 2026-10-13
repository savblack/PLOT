// Runs for every request to app.theplot.tv (Cloudflare Pages Functions
// middleware). Two jobs:
//  1. noindex any deployment that isn't app.theplot.tv — the per-branch
//     *.pages.dev previews. They also sit behind Cloudflare Access, so this
//     is defence in depth rather than the only guard.
//  2. Set the Content-Security-Policy on every HTML response. Pages' static
//     `_headers` file does not apply to Function responses, and the public
//     profile, list, save and watch-with pages are Functions, so the policy
//     has to be set here to cover them. Keep the allow-lists below in sync
//     with apps/web/src and functions/*.js.
//
// script-src allows no inline script at all: no 'unsafe-inline' and no nonce.
// Every script the app runs is a file (apps/web/public/boot/*.js for the
// pre-React startup guard, theme pre-paint and public-page analytics; Vite's
// hashed bundles for the rest). That is deliberate. An earlier version of
// this middleware minted a per-request nonce and stamped it onto every inline
// <script> it found in the response, which meant a <script> injected through
// an escaping slip in a server-rendered page would have been stamped too, and
// the CSP would have waved it through. With no inline allowance there is
// nothing to stamp, so an injected script is a broken page, not XSS.
//
// Anything new that needs to run before React must be a file under
// apps/web/public/boot/, not an inline block.
const CSP = [
  "default-src 'self'",
  "base-uri 'self'",
  "object-src 'none'",
  "frame-ancestors 'none'",
  "img-src 'self' data: blob: https://image.tmdb.org https://static.tvmaze.com https://mkegtssedjyqldysvzga.supabase.co https://uzrhfivnhdcfieuaxzip.supabase.co https://a.theplot.tv https://storage.ko-fi.com https://10.com.au https://10play.com.au https://cdn.iview.abc.net.au https://i.mjh.nz https://image.pr.sbsod.com https://imageresizer.static9.net.au",
  "style-src 'self' 'unsafe-inline'",
  "font-src 'self'",
  "script-src 'self' https://a.theplot.tv https://challenges.cloudflare.com",
  "connect-src 'self' https://mkegtssedjyqldysvzga.supabase.co wss://mkegtssedjyqldysvzga.supabase.co https://uzrhfivnhdcfieuaxzip.supabase.co wss://uzrhfivnhdcfieuaxzip.supabase.co https://tmdb-proxy.sav-black.workers.dev https://tmdb-proxy-staging.sav-black.workers.dev https://api.tvmaze.com https://a.theplot.tv https://challenges.cloudflare.com",
  "frame-src https://challenges.cloudflare.com https://www.youtube.com https://www.youtube-nocookie.com",
  "worker-src 'self' blob:",
  "form-action 'self'",
  'upgrade-insecure-requests',
].join('; ');

export { CSP };

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

  const headers = new Headers(response.headers);
  headers.set('Content-Security-Policy', CSP);
  if (isPreview) headers.set('X-Robots-Tag', 'noindex, nofollow');
  return new Response(response.body, { status: response.status, statusText: response.statusText, headers });
}
