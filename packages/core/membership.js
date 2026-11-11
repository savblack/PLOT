// What Settings › Billing shows a Premium member: where their membership
// stands and when it next changes. Pure, so web and mobile read it the same
// way. The input is get_my_billing_status (see useBillingStatus.js).
//
// Before this, a paying member saw the same three-line sales pitch as a Free
// viewer (design audit, 10 Nov 2026, pick 3.4 A: a membership card).

/**
 * @typedef {'attention' | 'ending' | 'trial' | 'active' | 'granted'} MembershipState
 *   attention  a payment failed and Stripe is retrying
 *   ending     cancelled, with paid time left
 *   trial      inside the free trial
 *   active     paying, renewing
 *   granted    Premium given by Plot, with no Stripe subscription
 */

/**
 * @param {{ status?: string | null, cancelAtPeriodEnd?: boolean, periodEnd?: string | null } | null | undefined} billing
 * @param {{ isPremium: boolean, canManage: boolean }} access  from billingAccess()
 * @returns {MembershipState | null} null when the viewer is not a member
 */
export function membershipState(billing, { isPremium, canManage }) {
  if (!isPremium) return null;
  if (!canManage) return 'granted';
  if (billing?.status === 'past_due' || billing?.status === 'unpaid') return 'attention';
  if (billing?.cancelAtPeriodEnd) return 'ending';
  if (billing?.status === 'trialing') return 'trial';
  return 'active';
}

/**
 * The date the current period ends, written out for a US reader
 * ("June 19, 2027"), or null when there is none to show.
 *
 * @param {{ periodEnd?: string | null } | null | undefined} billing
 * @returns {string | null}
 */
export function membershipDate(billing) {
  const value = billing?.periodEnd;
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return date.toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });
}

/**
 * Where each row of the plans page's Premium card leads inside the app, keyed
 * by that row's `icon`. The card's own labels are reused, so the membership
 * card and the plans page can never describe Premium differently.
 * @type {Record<string, string>}
 */
export const MEMBERSHIP_FEATURE_PATHS = {
  pick: '/tonight',
  together: '/together',
  lists: '/my-lists',
  stats: '/history',
  customise: '/settings/themes',
};
