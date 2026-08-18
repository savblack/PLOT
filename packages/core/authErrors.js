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
 * @param {string | null | undefined} msg Raw error message from Supabase Auth,
 *   or the literal 'no-session' sentinel that resolveAuthCallback returns.
 * @returns {'already_registered'|'weak_password'|'invalid_email'|'rate_limited'
 *   |'pkce_verifier_missing'|'pkce_verifier_mismatch'|'flow_state_expired'
 *   |'otp_expired'|'no_session'|'unknown'}
 */
export function authErrorReason(msg) {
  if (!msg) return 'unknown';
  if (msg.includes('User already registered'))      return 'already_registered';
  if (msg.includes('Password should be at least'))  return 'weak_password';
  if (msg.includes('Unable to validate email'))     return 'invalid_email';
  if (msg.includes('rate limit') || msg.includes('too many')) return 'rate_limited';

  // PKCE code-exchange failures, split because they have different causes and
  // different fixes. Mismatch means a verifier was present but belonged to a
  // different /authorize call — the signature of signInWithOAuth having fired
  // more than once, since each call overwrites the stored verifier. Missing
  // means there was no verifier in this browser at all: a callback opened in a
  // different browser, profile, or storage context than the one that started the
  // flow. Checked before the generic matches because GoTrue's mismatch text also
  // contains 'code verifier'.
  if (msg.includes('code challenge does not match')) return 'pkce_verifier_mismatch';
  if (msg.includes('code verifier'))                 return 'pkce_verifier_missing';
  // GoTrue: 'invalid flow state, no valid flow state found' — the single-use auth
  // code was already spent, or its flow state aged out.
  if (msg.includes('flow state'))                    return 'flow_state_expired';
  // Email links: both wordings mean the same thing to us.
  if (msg.includes('Email link is invalid or has expired')) return 'otp_expired';
  if (msg.includes('Token has expired or is invalid'))      return 'otp_expired';
  // resolveAuthCallback's own sentinel: nothing failed loudly, there was just no
  // session to be found by the time it gave up waiting.
  if (msg === 'no-session')                          return 'no_session';
  return 'unknown';
}
