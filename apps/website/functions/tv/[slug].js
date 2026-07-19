// /tv/<slug>
import { titlePage } from '../_lib/title.js';

export async function onRequest({ request, params }) {
  const slug = Array.isArray(params.slug) ? params.slug[0] : params.slug;
  return titlePage(request, 'tv', slug);
}
