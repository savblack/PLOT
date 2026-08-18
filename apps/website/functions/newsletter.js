// /newsletter (archive index)
import { newsletter } from './_lib/whats-on.js';

export async function onRequest({ request }) {
  return newsletter(request, null);
}
