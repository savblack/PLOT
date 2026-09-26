/**
 * PLOT Premium — shared plan constants and pure helpers.
 *
 * Lives in core so the mobile app inherits the same plan rules. Anything
 * web-only (Stripe checkout redirects) belongs in hooks/usePremium.js,
 * not here. These values mirror the server-side enforcement
 * (is_premium() / can_create_custom_list() in Postgres) — the DB is the
 * authority, the client only pre-checks for friendlier UX.
 *
 * Public pricing copy lives in packages/core/copy/plansPage.js (A$5 / A$40,
 * tentative). Do not reintroduce hardcoded plan price labels here.
 */

export const FREE_CUSTOM_LIST_CAP = 5;

export const PREMIUM_PLANS = Object.freeze({
  monthly: Object.freeze({ id: 'monthly', label: 'US$3/mo', amount: 3, currency: 'USD' }),
  yearly: Object.freeze({ id: 'yearly', label: 'US$24/yr', amount: 24, currency: 'USD' }),
});

export function isPremiumProfile(profile) {
  return !!profile?.is_premium;
}

export function canCreateCustomList(listCount, profile) {
  return isPremiumProfile(profile) || listCount < FREE_CUSTOM_LIST_CAP;
}

/** Turn the edge functions' `premium_required` 403 into a human message. */
export function friendlyPremiumError(message) {
  return message === 'premium_required'
    ? 'This is a PLOT Premium feature. Upgrade from Settings to unlock it.'
    : message;
}
