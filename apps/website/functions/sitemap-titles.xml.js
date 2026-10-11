// /sitemap-titles.xml — proxy `title-page?sitemap=1`, re-serve as XML.
// Port of apps/website/api/sitemap-titles.mjs.
import { SUPABASE_FN } from './_lib/proxy.js';
import { sitemapPage } from './_lib/sitemap.js';

const UPSTREAM = `${SUPABASE_FN}/title-page?sitemap=1`;

export async function onRequest({ request, waitUntil }) {
  return sitemapPage(request, UPSTREAM, waitUntil);
}
