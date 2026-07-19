// /whats-on/<slug>
import { whatsOn } from '../_lib/whats-on.js';

export async function onRequest({ request, params }) {
  const slug = Array.isArray(params.slug) ? params.slug[0] : params.slug;
  return whatsOn(request, slug);
}
