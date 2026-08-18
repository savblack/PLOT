// Host-based routing. On Vercel this was a redirect in vercel.json
// (host admin.theplot.tv, "/" -> /api/admin). On Cloudflare Pages the admin
// subdomain is a second custom domain on this project, so we route every
// admin.theplot.tv request straight to the admin-review proxy and let all other
// hosts (theplot.tv) fall through to the static site + its functions.
import { admin } from './_lib/admin.js';
import { acceptsMarkdown, homepageMarkdownResponse } from './_lib/markdown.js';
import { vanityTarget } from './_lib/vanity.js';

export async function onRequest(context) {
  const { request, env } = context;
  const url = new URL(request.url);
  const host = url.hostname;
  if (host === 'admin.theplot.tv') {
    return admin(request);
  }
  // Social bio links (/ig, /x, /th) pick up their utm_* here rather than in the
  // profile field itself, so the bio shows a clean URL and the visit is still
  // attributable. See _lib/vanity.js.
  const vanity = vanityTarget(url);
  if (vanity) return Response.redirect(vanity, 302);
  // Pricing isn't public yet. Redirect rather than 404 so an old bookmark or
  // shared link lands somewhere real. Flip SHOW_PRICING_PAGE=true (Cloudflare
  // Pages env var) to bring it back — no code change needed.
  if (url.pathname === '/plans.html' && env.SHOW_PRICING_PAGE !== 'true') {
    return Response.redirect(new URL('/', url), 302);
  }
  if ((request.method === 'GET' || request.method === 'HEAD') && url.pathname === '/' && acceptsMarkdown(request)) {
    return homepageMarkdownResponse(request, env);
  }
  return context.next();
}
