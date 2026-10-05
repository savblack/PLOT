export const CHECKOUT_PLANS = ['monthly', 'yearly'];

/** Anything other than a known plan falls back to monthly, the price the upgrade sheet shows. */
export function checkoutPlan(plan) {
  return CHECKOUT_PLANS.includes(plan) ? plan : 'monthly';
}

/** Where a signed-out visitor goes to make an account; the chosen plan survives sign-up. */
export function signupPathForPlan(plan) {
  return `/signup?intent=premium&plan=${checkoutPlan(plan)}`;
}

/**
 * The server only returns safe messages with a 409 ("checkout is already being prepared"),
 * so those are shown as written. Everything else gets the generic wording.
 */
export function checkoutErrorMessage(status, serverMessage, fallback) {
  return status === 409 && serverMessage ? serverMessage : fallback;
}
