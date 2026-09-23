// Host-based routing. admin.theplot.tv used to proxy to the admin-review Edge
// Function; that desk is retired (docs/ops/retire-admin-review.md). While the
// custom domain still points at this Pages project, answer 410 so the hostname
// cannot fall through to the marketing site. Other hosts (theplot.tv) fall
// through to the static site + its functions.
import { acceptsMarkdown, homepageMarkdownResponse } from './_lib/markdown.js';
import { vanityTarget } from './_lib/vanity.js';

export async function onRequest(context) {
  const { request, env } = context;
  const url = new URL(request.url);
  const host = url.hostname;
  if (host === 'admin.theplot.tv') {
    if (url.pathname === '/robots.txt') {
      return new Response('User-agent: *\nDisallow: /\n', {
        headers: {
          'Content-Type': 'text/plain; charset=utf-8',
          'Cache-Control': 'public, max-age=86400',
          'X-Robots-Tag': 'noindex, nofollow',
        },
      });
    }
    return new Response('This page has been removed.', {
      status: 410,
      headers: {
        'Content-Type': 'text/plain; charset=utf-8',
        'X-Robots-Tag': 'noindex, nofollow',
      },
    });
  }
  // Social bio links (/ig, /x, /th) pick up their utm_* here rather than in the
  // profile field itself, so the bio shows a clean URL and the visit is still
  // attributable. See _lib/vanity.js.
  const vanity = vanityTarget(url);
  if (vanity) return Response.redirect(vanity, 302);
  // Pricing isn't public yet. Redirect rather than 404 so an old bookmark or
  // shared link lands somewhere real. Flip SHOW_PRICING_PAGE=true (Cloudflare
  // Pages env var) to bring it back — no code change needed.
  // Cloudflare Pages' html_handling serves plans.html at both /plans and
  // /plans.html, so gate both paths (gating only .html left /plans live).
  if (
    (url.pathname === '/plans' || url.pathname === '/plans.html')
    && env.SHOW_PRICING_PAGE !== 'true'
  ) {
    return Response.redirect(new URL('/', url), 302);
  }
  // Collapse the trailing-slash variant so /whats-on and /whats-on/ don't
  // compete as duplicates (both previously returned 200 with the same body).
  if (url.pathname === '/whats-on/') {
    url.pathname = '/whats-on';
    return Response.redirect(url, 301);
  }
  if ((request.method === 'GET' || request.method === 'HEAD') && url.pathname === '/' && acceptsMarkdown(request)) {
    return homepageMarkdownResponse(request, env);
  }
  return context.next();
}
