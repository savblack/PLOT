// The browser and app side of signup-bypass, shared by web AuthPage and
// mobile app/(auth)/index.tsx.
//
// When Turnstile never returns a token, signup, resend, and magic link post
// to the signup-bypass Edge Function instead of GoTrue. That function keeps
// its own bot checks: a honeypot field, a signed form token that proves the
// form was open long enough, per-IP and global rate limits, and the same
// generic success for an unknown or existing address. This module only
// carries those inputs. It never calls GoTrue, so it can never post an empty
// captcha token there.
//
// The platform supplies the Supabase client and, for the app, asks for the
// email link to open plot://auth/callback instead of the web callback.

import { COMMON } from './copy/common.js';
import { AUTH_PAGE } from './copy/authPage.js';
import { signupFormTokenIsStale } from './signupFormToken.js';
import { AUTH_REQUEST_TIMEOUT_MS, AUTH_TIMEOUT_MESSAGE, withAuthTimeout } from './authTimeout.js';
import { authErrorReason } from './authErrors.js';

/**
 * Whether a failed call never got an answer from the function: it timed out,
 * or the browser could not reach it. Those deserve "check your connection",
 * not "something went wrong". supabase-js reports an unreachable function as
 * FunctionsFetchError, whose own message does not mention the network.
 *
 * @param {any} error
 * @returns {boolean}
 */
function isTransportFailure(error) {
  if (!error) return false;
  if (error.name === 'FunctionsFetchError') return true;
  const slug = authErrorReason(error.message);
  return slug === 'timeout' || slug === 'network';
}

/**
 * signup-bypass's MIN_SUBMIT_MS is 1200. Stay above it so a real person who
 * taps straight away is not shown a success screen for an account the server
 * declined to create.
 */
export const BYPASS_MIN_FORM_MS = 1500;

/**
 * Friendly copy for signup-bypass's structured error reasons. These are the
 * function's own reason strings, not raw GoTrue messages.
 *
 * @param {string | null | undefined} reason
 * @returns {string}
 */
export function bypassErrorMessage(reason) {
  if (reason === 'rate_limited') return AUTH_PAGE.rateLimited;
  if (reason === 'already_registered') return AUTH_PAGE.accountAlreadyExists;
  if (reason === 'link_withdrawn') return AUTH_PAGE.linkWithdrawn;
  if (reason === 'link_withdraw_failed') return AUTH_PAGE.linkWithdrawFailed;
  return COMMON.genericError;
}

/**
 * supabase-js returns data: null for any non-2xx, so the function's
 * structured { reason } only survives in error.context (the Response).
 *
 * @param {any} error
 * @param {any} data
 * @returns {Promise<{ reason: string | null, status: number | null }>}
 */
export async function readBypassFailure(error, data) {
  let reason = typeof data?.reason === 'string' ? data.reason : null;
  let status = null;
  if (error) {
    try {
      status = error.context?.status ?? null;
      const body = await error.context?.clone?.().json();
      if (typeof body?.reason === 'string') reason = body.reason;
    } catch { /* network error or non-JSON body */ }
  }
  return { reason, status };
}

/**
 * @typedef {{ ok: false, superseded: true, reason: 'superseded' }} BypassSuperseded
 * @typedef {{
 *   ok: false,
 *   superseded: false,
 *   reason: string,
 *   analyticsReason: string,
 *   status?: number,
 *   message: string,
 * }} BypassFailure
 * @typedef {{ ok: true, created: boolean }} BypassSignupSuccess
 * @typedef {{ ok: true }} BypassLinkSuccess
 */

/**
 * @param {object} deps
 * @param {() => any | Promise<any>} deps.getSupabase Returns the configured Supabase client.
 * @param {'web' | 'app'} [deps.client] 'app' asks for the email link to open the native app.
 * @param {() => number} [deps.now]
 * @param {(ms: number) => Promise<void>} [deps.sleep]
 * @param {number} [deps.minFormMs]
 * @param {number} [deps.timeoutMs] How long one call may take. See authTimeout.js.
 */
export function createSignupBypassClient({
  getSupabase,
  client = 'web',
  now = () => Date.now(),
  sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
  minFormMs = BYPASS_MIN_FORM_MS,
  timeoutMs = AUTH_REQUEST_TIMEOUT_MS,
}) {
  // Signed {iat} token from the function's GET endpoint: a server-observed
  // clock the POST is timed against, since a client timestamp could be claimed.
  let formToken = null;
  // When this client stored the token. Decides both the minimum wait and when
  // the token is too old to reuse (past the server's 15-minute cap the
  // function answers { ok: true } and creates nothing).
  let formTokenAt = 0;
  // Bumped on every fetch and on reset, so a slow GET cannot overwrite a
  // newer token or revive one that was dropped.
  let fetchGen = 0;
  // Why the last token fetch came back empty, so prepare() can say so.
  let tokenTransportFailed = false;

  // Time-limited, and always answers { data, error }. This is the path people
  // take when the captcha is blocked, and an unanswered call used to leave
  // Create account spinning with no end (found in a local test, 2026-11-09).
  const invoke = async (method, body) => {
    try {
      return await withAuthTimeout((async () => {
        const supabase = await getSupabase();
        return supabase.functions.invoke('signup-bypass', body ? { method, body } : { method });
      })(), timeoutMs);
    } catch (e) {
      return { data: null, error: { message: e?.message || AUTH_TIMEOUT_MESSAGE } };
    }
  };

  // Web callers send nothing extra, so the function keeps its existing
  // origin-based redirect for them.
  const clientField = client === 'app' ? { client: 'app' } : {};

  /** @returns {Promise<string | null>} */
  const loadFormToken = async () => {
    const gen = ++fetchGen;
    try {
      const { data, error } = await invoke('GET');
      if (gen === fetchGen) tokenTransportFailed = isTransportFailure(error);
      if (gen !== fetchGen || !data?.formToken) return formToken;
      formToken = data.formToken;
      formTokenAt = now();
    } catch { /* bypass simply won't be available if this fails */ }
    return formToken;
  };

  /** @returns {Promise<string | null>} */
  const ensureFormToken = async () => {
    if (formToken && !signupFormTokenIsStale(formTokenAt, now())) return formToken;
    // Drop the expired token before the fetch. A failed refresh must not
    // fall back to it and paint a confirmation for an account that was
    // never created.
    formToken = null;
    formTokenAt = 0;
    return loadFormToken();
  };

  const reset = () => {
    fetchGen += 1;
    formToken = null;
    formTokenAt = 0;
  };

  const waitOutMinimum = async () => {
    if (!formTokenAt) return;
    const since = now() - formTokenAt;
    if (since < minFormMs) await sleep(minFormMs - since);
  };

  /**
   * Token, then the server's minimum form age. Returns null when the
   * attempt was superseded, or a failure when no token could be fetched.
   *
   * @param {() => boolean} isCurrent
   * @returns {Promise<null | BypassSuperseded | BypassFailure>}
   */
  const prepare = async (isCurrent) => {
    const token = await ensureFormToken();
    if (!isCurrent()) return { ok: false, superseded: true, reason: 'superseded' };
    if (!token) {
      return {
        ok: false,
        superseded: false,
        reason: 'bypass_no_form_token',
        analyticsReason: 'bypass_no_form_token',
        message: tokenTransportFailed ? AUTH_PAGE.connectionFailed : COMMON.genericError,
      };
    }
    await waitOutMinimum();
    if (!isCurrent()) return { ok: false, superseded: true, reason: 'superseded' };
    return null;
  };

  /**
   * Create an unconfirmed account and email its confirmation link.
   * `created: false` is the function's quiet { ok: true } for a honeypot hit
   * or a too-fast post. It looks like success on purpose.
   *
   * @param {{ email: string, password: string, website?: string, isCurrent?: () => boolean }} opts
   * @returns {Promise<BypassSignupSuccess | BypassSuperseded | BypassFailure>}
   */
  const signUp = async ({ email, password, website = '', isCurrent = () => true }) => {
    const blocked = await prepare(isCurrent);
    if (blocked) return blocked;
    const { data, error } = await invoke('POST', { email, password, website, formToken, ...clientField });
    if (!isCurrent()) return { ok: false, superseded: true, reason: 'superseded' };
    if (error || data?.error) {
      const { reason, status } = await readBypassFailure(error, data);
      if (!isCurrent()) return { ok: false, superseded: true, reason: 'superseded' };
      // A transport failure with no reason keeps its old analytics slug. A
      // timeout is new and gets its own, so the two can be told apart.
      const timedOut = !reason && error?.message === AUTH_TIMEOUT_MESSAGE;
      const analyticsReason = reason
        ? `bypass_${reason}`
        : (timedOut ? 'bypass_timeout' : (error ? 'bypass_create_failed' : 'bypass_unknown'));
      return {
        ok: false,
        superseded: false,
        reason: reason || 'unknown',
        analyticsReason,
        ...(status ? { status } : {}),
        message: !reason && isTransportFailure(error) ? AUTH_PAGE.connectionFailed : bypassErrorMessage(reason),
      };
    }
    return { ok: true, created: Boolean(data?.requires_email_confirmation) };
  };

  /**
   * Resend a confirmation, or send a magic link, through Resend. A fake
   * { ok: true } (honeypot, or a submit that was too fast) is still success.
   *
   * @param {{
   *   action: 'resend' | 'magiclink',
   *   email: string,
   *   website?: string,
   *   confirmSignup?: boolean,
   *   isCurrent?: () => boolean,
   * }} opts
   * @returns {Promise<BypassLinkSuccess | BypassSuperseded | BypassFailure>}
   */
  const sendLink = async ({ action, email, website = '', confirmSignup = false, isCurrent = () => true }) => {
    const blocked = await prepare(isCurrent);
    if (blocked) return blocked;
    const { data, error } = await invoke('POST', {
      email,
      website,
      formToken,
      action,
      confirmSignup,
      ...clientField,
    });
    if (!isCurrent()) return { ok: false, superseded: true, reason: 'superseded' };
    if (error || data?.error) {
      const { reason, status } = await readBypassFailure(error, data);
      if (!isCurrent()) return { ok: false, superseded: true, reason: 'superseded' };
      const timedOut = !reason && error?.message === AUTH_TIMEOUT_MESSAGE;
      return {
        ok: false,
        superseded: false,
        reason: reason || 'bypass_email_failed',
        analyticsReason: reason ? `bypass_${reason}` : (timedOut ? 'bypass_timeout' : 'bypass_email_failed'),
        ...(status ? { status } : {}),
        message: !reason && isTransportFailure(error) ? AUTH_PAGE.connectionFailed : bypassErrorMessage(reason),
      };
    }
    return { ok: true };
  };

  return { loadFormToken, ensureFormToken, reset, signUp, sendLink };
}
