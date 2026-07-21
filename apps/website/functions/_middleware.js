// Host-based routing. On Vercel this was a redirect in vercel.json
// (host admin.theplot.tv, "/" -> /api/admin). On Cloudflare Pages the admin
// subdomain is a second custom domain on this project, so we route every
// admin.theplot.tv request straight to the admin-review proxy and let all other
// hosts (theplot.tv) fall through to the static site + its functions.
import { admin } from './_lib/admin.js';
import { acceptsMarkdown, homepageMarkdownResponse } from './_lib/markdown.js';

export async function onRequest(context) {
  const { request } = context;
  const url = new URL(request.url);
  const host = url.hostname;
  if (host === 'admin.theplot.tv') {
    return admin(request);
  }
  if ((request.method === 'GET' || request.method === 'HEAD') && url.pathname === '/' && acceptsMarkdown(request)) {
    return homepageMarkdownResponse(request);
  }
  return context.next();
}
