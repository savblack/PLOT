// Decides what /auth/callback should tell PostHog.
//
// Email+password signup fires user_signed_up on the form, because that path
// returns a session immediately. signup-bypass does not: the account stays
// unconfirmed until the person opens the email, often minutes later and often
// in another tab. sessionStorage from the form is empty there, and a 60 second
// created_at window has already closed. The confirmation link carries
// ?from=signup&via=bypass so this page can still tell a first confirmation
// from a later sign-in.
//
// A link for someone who confirmed long ago must not count as a second signup.
// email_confirmed_at stays at the first confirmation, so a fresh value means
// this click is the one that confirmed them.

export const SIGNUP_ACCOUNT_WINDOW_MS = 60_000;
export const JUST_CONFIRMED_WINDOW_MS = 15 * 60 * 1000;
const SIGNUP_TRACKED_PREFIX = 'plot_user_signed_up:';
const PENDING_KEY = 'plot_pending_bypass_signup';
const PENDING_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;

/**
 * @param {string} search Raw location.search, with or without the leading ?.
 */
export function readCallbackIntent(search) {
  const params = new URLSearchParams(String(search || '').replace(/^\?/, ''));
  return {
    fromSignup: params.get('from') === 'signup',
    viaBypass: params.get('via') === 'bypass',
    method: params.get('method') || null,
  };
}

/**
 * @param {string | null | undefined} userId
 * @param {{ get: (key: string) => string | null }} storage
 */
export function signupAlreadyTracked(userId, storage) {
  if (!userId) return false;
  try { return storage.get(SIGNUP_TRACKED_PREFIX + userId) === '1'; }
  catch { return false; }
}

/**
 * @param {string} userId
 * @param {{ set: (key: string, value: string) => void }} storage
 */
export function rememberSignupTracked(userId, storage) {
  if (!userId) return;
  try { storage.set(SIGNUP_TRACKED_PREFIX + userId, '1'); }
  catch { /* private mode */ }
}

/**
 * @param {string} email
 * @param {{ set: (key: string, value: string) => void }} storage
 * @param {number} [now]
 */
export function rememberPendingBypassSignup(email, storage, now = Date.now()) {
  const normalized = String(email || '').trim().toLowerCase();
  if (!normalized) return;
  try { storage.set(PENDING_KEY, JSON.stringify({ email: normalized, at: now })); }
  catch { /* private mode */ }
}

/**
 * @param {string | null | undefined} email
 * @param {{ get: (key: string) => string | null }} storage
 * @param {number} [now]
 */
export function pendingBypassMatches(email, storage, now = Date.now()) {
  const normalized = String(email || '').trim().toLowerCase();
  if (!normalized) return false;
  let raw;
  try { raw = storage.get(PENDING_KEY); }
  catch { return false; }
  if (!raw) return false;
  try {
    const parsed = JSON.parse(raw);
    if (!parsed?.email || !Number.isFinite(parsed.at)) return false;
    if (now - parsed.at > PENDING_MAX_AGE_MS || now < parsed.at) return false;
    return parsed.email === normalized;
  } catch {
    return false;
  }
}

/**
 * @param {{ remove: (key: string) => void }} storage
 */
export function clearPendingBypassSignup(storage) {
  try { storage.remove(PENDING_KEY); }
  catch { /* private mode */ }
}

/**
 * @param {object} opts
 * @param {{ id?: string, email?: string, created_at?: string, email_confirmed_at?: string | null, confirmed_at?: string | null } | null | undefined} opts.user
 * @param {string | null | undefined} opts.sessionMethod Method stashed in sessionStorage, if any.
 * @param {string} [opts.search]
 * @param {boolean} [opts.pendingBypass] Same browser started a bypass signup for this email.
 * @param {boolean} [opts.alreadyTracked]
 * @param {number} [opts.now]
 * @returns {{
 *   identify: boolean,
 *   event: 'user_signed_up' | 'user_logged_in' | null,
 *   props: Record<string, unknown> | null,
 *   rememberSignup: boolean,
 *   markReferral: boolean,
 *   deduped?: boolean,
 * }}
 */
export function planAuthCallbackReport({
  user,
  sessionMethod = null,
  search = '',
  pendingBypass = false,
  alreadyTracked = false,
  now = Date.now(),
}) {
  const empty = { identify: false, event: null, props: null, rememberSignup: false, markReferral: false };
  if (!user?.id) return empty;

  const intent = readCallbackIntent(search);
  const method = intent.method || sessionMethod || null;
  const createdMs = user.created_at ? Date.parse(user.created_at) : 0;
  const freshAccount = createdMs > 0 && (now - createdMs) < SIGNUP_ACCOUNT_WINDOW_MS && (now - createdMs) >= 0;
  const confirmedRaw = user.email_confirmed_at || user.confirmed_at;
  const confirmedMs = confirmedRaw ? Date.parse(confirmedRaw) : 0;
  const justConfirmed = confirmedMs > 0 && (now - confirmedMs) < JUST_CONFIRMED_WINDOW_MS && (now - confirmedMs) >= 0;
  // via=bypass on its own is a sign-in link (magic link). It becomes a signup
  // only when the link says from=signup, this browser still has the bypass
  // pending flag, or AuthPage stashed method "email" before the redirect.
  const bypassSignup = intent.fromSignup || pendingBypass || sessionMethod === 'email';
  // from=signup is authoritative when this click did the confirming (or the
  // timestamp has not landed on the session yet). An old email_confirmed_at
  // means they were already a member and this link is only a sign-in.
  const signupFromLink = bypassSignup && (justConfirmed || !confirmedMs);
  const isSignup = freshAccount || signupFromLink;

  if (!isSignup && !method) return empty;

  if (!isSignup) {
    return {
      identify: true,
      event: 'user_logged_in',
      props: { method: method || 'email' },
      rememberSignup: false,
      markReferral: false,
    };
  }

  const countAsBypass = bypassSignup;
  const props = {
    method: countAsBypass ? 'email' : (method || 'email'),
  };
  if (countAsBypass) props.via_bypass = true;

  if (alreadyTracked) {
    return { identify: true, event: null, props: null, rememberSignup: false, markReferral: false, deduped: true };
  }

  return {
    identify: true,
    event: 'user_signed_up',
    props,
    rememberSignup: true,
    markReferral: true,
  };
}
