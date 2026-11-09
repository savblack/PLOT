/**
 * A time limit for auth requests that can otherwise hang for minutes.
 *
 * Supabase Auth calls go through fetch, which has no timeout of its own. When
 * a browser cannot reach Supabase, the request sits until the browser gives
 * up (about 90 seconds in the 2026-10-31 signup recording) and the button
 * spins the whole time. The Google button was worse: its re-entry guard only
 * released on an error, so a request that never answered left it dead for the
 * rest of the visit, and every later tap did nothing.
 *
 * withAuthTimeout rejects with AUTH_TIMEOUT_MESSAGE once the limit passes, so
 * the caller's normal error path runs: the button unlocks, the person sees a
 * message, and the failure is reported. The underlying request is not
 * cancelled (supabase-js takes no AbortSignal here). Callers must treat a late
 * answer as stale, which the auth epoch already does on web.
 */

/** How long an auth request may take before we stop waiting for it. */
export const AUTH_REQUEST_TIMEOUT_MS = 15000;

/**
 * The error message a timed-out request rejects with. authErrorReason maps it
 * to the `timeout` analytics slug.
 */
export const AUTH_TIMEOUT_MESSAGE = 'auth-timeout';

/**
 * Race a promise against a timer.
 *
 * @template T
 * @param {Promise<T>} promise
 * @param {number} [ms]
 * @param {{ setTimer?: typeof setTimeout, clearTimer?: typeof clearTimeout }} [timers]
 *   Injectable for tests.
 * @returns {Promise<T>} Settles like `promise`, or rejects with an Error whose
 *   message is AUTH_TIMEOUT_MESSAGE if `ms` passes first.
 */
export function withAuthTimeout(promise, ms = AUTH_REQUEST_TIMEOUT_MS, timers = {}) {
  const setTimer = timers.setTimer ?? setTimeout;
  const clearTimer = timers.clearTimer ?? clearTimeout;
  let id;
  const timeout = new Promise((_, reject) => {
    id = setTimer(() => reject(new Error(AUTH_TIMEOUT_MESSAGE)), ms);
  });
  return Promise.race([promise, timeout]).finally(() => clearTimer(id));
}
