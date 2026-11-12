// The signed-in "Go Premium" link: a pink chip in the side nav, just above
// the profile, and a line in the Settings account card, on web and mobile. It opens the existing Premium page (web /pricing, the phone's
// Settings › Premium), where the existing Checkout lives. The logged-out site
// and nav do not use it. Copy: PLANS_PAGE.goPremium.
import { PLANS_PAGE } from './copy/plansPage.js';

/** Where the link sits; the `placement` of premium_link_clicked. */
export const GO_PREMIUM_PLACEMENTS = Object.freeze(['side_nav', 'settings']);

/**
 * What the link says, or null when it should not draw: signed out, already
 * Premium, or billing not read yet (so it never flashes the trial line at
 * someone who has had it). `trialEligible` is core/billing.js trialEligible()
 * of the billing read, or web usePremium().trialEligible: the trial line only
 * shows to someone who has never subscribed.
 *
 * The side-nav chip (`variant: 'chip'`) always says just "Go Premium", with
 * no trial line; `trial` still reports eligibility for the click event.
 *
 * @param {{ signedIn: boolean, isPremium?: boolean, billingReady: boolean, trialEligible?: boolean | null, variant?: 'line' | 'chip' }} input
 * @returns {{ label: string, trial: boolean } | null}
 */
export function goPremiumLink({ signedIn, isPremium = false, billingReady, trialEligible = false, variant = 'line' }) {
  if (!signedIn || isPremium || !billingReady) return null;
  const trial = trialEligible === true;
  if (variant === 'chip') return { label: PLANS_PAGE.goPremium.chip, trial };
  return { label: trial ? PLANS_PAGE.goPremium.trial : PLANS_PAGE.goPremium.plain, trial };
}
