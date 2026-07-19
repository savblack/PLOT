// /whats-on (index)
import { whatsOn } from './_lib/whats-on.js';

export async function onRequest({ request }) {
  return whatsOn(request, null);
}
