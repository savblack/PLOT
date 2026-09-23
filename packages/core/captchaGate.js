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
 */

/** How long to wait for a Turnstile token before giving up on this attempt. */
export const CAPTCHA_TOKEN_WAIT_MS = 4000;

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
