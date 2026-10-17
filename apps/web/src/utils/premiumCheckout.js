// Shim: the plans, error wording, waitlist mailto and checkout request live in
// @plot/core/premiumCheckout.js so web and mobile cannot drift. The one web-only
// piece is where a signed-out visitor goes to make an account.
import { checkoutPlan } from '@plot/core/premiumCheckout.js';

export * from '@plot/core/premiumCheckout.js';

/** Where a signed-out visitor goes to make an account; the chosen plan survives sign-up. */
export function signupPathForPlan(plan) {
  return `/signup?intent=premium&plan=${checkoutPlan(plan)}`;
}
