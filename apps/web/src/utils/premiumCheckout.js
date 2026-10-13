export const CHECKOUT_PLANS = ['monthly', 'yearly'];

/** Anything other than a known plan falls back to monthly, the price the upgrade sheet shows. */
export function checkoutPlan(plan) {
  return CHECKOUT_PLANS.includes(plan) ? plan : 'monthly';
}

/** Where a signed-out visitor goes to make an account; the chosen plan survives sign-up. */
export function signupPathForPlan(plan) {
  return `/signup?intent=premium&plan=${checkoutPlan(plan)}`;
}

/** Mailto for the closed-checkout waitlist. No payment, no new account store. */
export function waitlistMailto(subject) {
  return `mailto:support@theplot.tv?subject=${encodeURIComponent(subject)}`;
}

/**
 * 409 keeps the server's own sentence (checkout is already being prepared).
 * `premium_coming_soon` is the closed state, not a glitch to retry.
 * Other 503s are "not available right now" (price config, billing account).
 * Anything else uses the generic retry line.
 *
 * @param {number | undefined} status
 * @param {string | undefined} serverMessage
 * @param {string} fallback
 * @param {{ code?: string, closed?: string, unavailable?: string }} [extra]
 */
export function checkoutErrorMessage(status, serverMessage, fallback, extra = {}) {
  if (extra.code === 'premium_coming_soon') return extra.closed || fallback;
  if (status === 409 && serverMessage) return serverMessage;
  if (status === 503 && extra.unavailable) return extra.unavailable;
  return fallback;
}
