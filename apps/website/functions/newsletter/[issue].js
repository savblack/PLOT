// /newsletter/<week-start> (one archived issue, e.g. /newsletter/2026-08-03)
import { newsletter } from '../_lib/whats-on.js';

export async function onRequest({ request, params }) {
  const issue = Array.isArray(params.issue) ? params.issue[0] : params.issue;
  return newsletter(request, issue);
}
