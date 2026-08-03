/**
 * Stable slugs for Supabase Auth failures, used as analytics properties.
 *
 * Shared so a `signup_submit_failed` breakdown groups the same way regardless
 * of which app produced it — if web reported `already_registered` and mobile
 * reported something else for the same failure, the funnel would split.
 *
 * This is deliberately *only* the slug. User-facing wording stays per-app
 * (web's `friendlyError`, mobile's `friendlyAuthError`) because the two
 * surfaces word things differently.
 *
 * Matching is on Supabase's raw message text, so these are best-effort: an
 * unrecognised message becomes 'unknown' rather than leaking the raw string
 * into analytics.
 *
 * @param {string | null | undefined} msg Raw error message from Supabase Auth.
 * @returns {'already_registered'|'weak_password'|'invalid_email'|'rate_limited'|'unknown'}
 */
export function authErrorReason(msg) {
  if (!msg) return 'unknown';
  if (msg.includes('User already registered'))      return 'already_registered';
  if (msg.includes('Password should be at least'))  return 'weak_password';
  if (msg.includes('Unable to validate email'))     return 'invalid_email';
  if (msg.includes('rate limit') || msg.includes('too many')) return 'rate_limited';
  return 'unknown';
}
