/**
 * PLOT Supporter — shared plan constants and pure helpers.
 *
 * Lives in core so the mobile app inherits the same plan rules. Anything
 * web-only (Stripe checkout redirects) belongs in hooks/useSupporter.js,
 * not here. These values mirror the server-side enforcement
 * (is_supporter() / can_create_custom_list() in Postgres) — the DB is the
 * authority, the client only pre-checks for friendlier UX.
 */

export const FREE_CUSTOM_LIST_CAP = 3;

export const SUPPORTER_PLANS = Object.freeze({
  monthly: { id: 'monthly', label: '$3/mo' },
  yearly:  { id: 'yearly',  label: '$25/yr' },
});

export function isSupporterProfile(profile) {
  return !!profile?.is_supporter;
}

export function canCreateCustomList(listCount, profile) {
  return isSupporterProfile(profile) || listCount < FREE_CUSTOM_LIST_CAP;
}

/** Turn the edge functions' `supporter_required` 403 into a human message. */
export function friendlySupporterError(message) {
  return message === 'supporter_required'
    ? 'This is a PLOT Supporter feature — support PLOT from Settings to unlock it.'
    : message;
}
