// Client freshness for the signup-bypass form token.
//
// supabase/functions/signup-bypass/index.ts answers { ok: true } and creates
// nothing when the token is older than MAX_TOKEN_AGE_MS (15 minutes). That
// response looks like success. Reusing a token from page load after the
// form has sat open is how a real person lands on the confirmation screen
// with no account and no email. Refresh while the token is still comfortably
// inside the server window. A new token restarts the server's minimum
// submit clock, so the caller still has to wait that out.

/** Must match MAX_TOKEN_AGE_MS in supabase/functions/signup-bypass/index.ts. */
export const SIGNUP_FORM_TOKEN_SERVER_MAX_MS = 15 * 60 * 1000;

// Five minutes under the server cap. Covers the POST after this check.
// The captcha wait runs before the check, so it is not part of this margin.
export const SIGNUP_FORM_TOKEN_REFRESH_AFTER_MS = 10 * 60 * 1000;

/**
 * @param {number} issuedAt Client time when the current token was stored. 0 if there is none.
 * @param {number} [now]
 * @returns {boolean} True when the token should be thrown away and fetched again.
 */
export function signupFormTokenIsStale(issuedAt, now = Date.now()) {
  if (!issuedAt) return true;
  return now - issuedAt >= SIGNUP_FORM_TOKEN_REFRESH_AFTER_MS;
}
