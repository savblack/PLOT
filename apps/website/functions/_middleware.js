// Host-based routing. On Vercel this was a redirect in vercel.json
// (host admin.theplot.tv, "/" -> /api/admin). On Cloudflare Pages the admin
// subdomain is a second custom domain on this project, so we route every
// admin.theplot.tv request straight to the admin-review proxy and let all other
// hosts (theplot.tv) fall through to the static site + its functions.
import { admin } from './_lib/admin.js';

export async function onRequest(context) {
  const host = new URL(context.request.url).hostname;
  if (host === 'admin.theplot.tv') {
    return admin(context.request);
  }
  return context.next();
}
