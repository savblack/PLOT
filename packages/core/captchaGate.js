/**
 * What an auth submit should do when Cloudflare Turnstile may not have
 * produced a token yet.
 *
 * Signup was the path that went quiet. The Create account button stayed
 * disabled until an invisible widget returned a token, and the fallback
 * (signup-bypass) only armed after a second widget failure. That second
 * failure has never shown up in analytics, so the button could sit grey
 * forever and GoTrue never saw a signup request.
 *
 * Signup therefore waits briefly, then uses the bypass if there is still
 * no token. Login, password reset, and magic link have no bypass. They
 * wait the same amount of time, then the caller shows an error instead of
 * posting an empty token.
 *
 * The second attempt is a retry after the widget reports an error. A
 * timeout is not an error: resetting then would wipe an interactive
 * challenge while the person is still solving it. Callers must ask
 * shouldResetCaptcha before calling turnstile.reset().
 */

/** How long to wait for a Turnstile token before giving up on this attempt. */
export const CAPTCHA_TOKEN_WAIT_MS = 8000;

/**
 * How many times a submit runs the widget before bypass or the error.
 * Attempt 1 starts the challenge. Attempt 2 runs only as a fresh challenge
 * when attempt 1 ended in a widget error. A timeout keeps waiting on the
 * same challenge instead of resetting it.
 */
export const CAPTCHA_SUBMIT_ATTEMPTS = 2;

/**
 * Whether this attempt should call turnstile.reset() before waiting.
 * The first attempt starts the challenge. A later attempt resets only
 * after the widget reported an error.
 *
 * @param {{ attempt: number, widgetErrored?: boolean }} opts
 * @returns {boolean}
 */
export function shouldResetCaptcha({ attempt, widgetErrored = false }) {
  if (attempt <= 1) return true;
  return Boolean(widgetErrored);
}

/**
 * @param {object} opts
 * @param {string} [opts.siteKey] Turnstile site key. Falsy means captcha is off.
 * @param {string | null | undefined} opts.token Current Turnstile token.
 * @param {'signup'|'login'|'forgot'|'magic'} opts.mode
 * @param {boolean} [opts.blocked] The widget has already failed in this browser.
 * @param {boolean} [opts.waited] The caller already waited CAPTCHA_TOKEN_WAIT_MS.
 * @returns {'ready'|'wait'|'bypass'|'unavailable'}
 *   ready: call Supabase Auth with the token (or with none, if captcha is off).
 *   wait: no token yet. Wait, then call this again with waited: true.
 *   bypass: signup without a token, via signup-bypass.
 *   unavailable: no token and no bypass. Show an error, do not call GoTrue.
 */
export function captchaSubmitPlan({ siteKey, token, mode, blocked = false, waited = false }) {
  if (!siteKey || token) return 'ready';
  if (mode === 'signup' && (blocked || waited)) return 'bypass';
  if (waited) return 'unavailable';
  return 'wait';
}
