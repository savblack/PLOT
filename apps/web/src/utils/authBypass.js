import { authErrorReason } from '@plot/core/authErrors.js';

// When the browser should ask signup-bypass to send the email instead of
// GoTrue. GoTrue's own mailer returns 500 with "535 Authentication
// credentials invalid", and a missing Turnstile token returns captcha_failed.
// signup-bypass sends through Resend and still rate-limits the request.

/**
 * @param {{ message?: string, status?: number, statusCode?: number } | null | undefined} error
 */
export function gotrueMailOrCaptchaFailed(error) {
  if (!error) return false;
  const status = Number(error.status ?? error.statusCode);
  const message = String(error.message || '');
  if (/captcha/i.test(message)) return true;
  if (status === 500) return true;
  if (/535|authentication credentials invalid|smtp/i.test(message)) return true;
  return false;
}

/**
 * @param {{ captchaRequired: boolean, captchaToken: string | null | undefined, error?: { message?: string, status?: number } | null }} opts
 */
export function shouldResendViaBypass({ captchaRequired, captchaToken, error = null }) {
  if (captchaRequired && !captchaToken) return true;
  return gotrueMailOrCaptchaFailed(error);
}

/**
 * @param {{
 *   captchaRequired: boolean,
 *   captchaToken: string | null | undefined,
 *   plan?: string | null,
 *   error?: { message?: string, status?: number } | null,
 * }} opts
 */
export function shouldMagicLinkViaBypass({ captchaRequired, captchaToken, plan = null, error = null }) {
  if (captchaRequired && !captchaToken) return true;
  if (plan === 'unavailable') return true;
  return gotrueMailOrCaptchaFailed(error);
}

/**
 * Unconfirmed password sign-in. The login form turns into the inbox screen
 * so the person can resend the confirmation instead of staring at the warning.
 *
 * @param {string | null | undefined} message
 */
export function loginNeedsConfirmation(message) {
  return authErrorReason(message) === 'email_not_confirmed';
}
