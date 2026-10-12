// Web-only. The purchase control follows billing-availability: checkout when
// the server says it is open, a waitlist mailto when it is closed. Unknown
// (the read failed or has not returned) keeps Upgrade, and startCheckout
// maps a premium_coming_soon response onto the closed state.
import { PLANS_PAGE } from '../copy/plansPage.js';
import { waitlistMailto } from '../utils/premiumCheckout.js';

/**
 * @param {{ premium: { checkoutAvailable: boolean | null, busy: boolean, startCheckout: (plan: string) => void }, plan: string, className?: string }} props
 */
export default function PremiumPurchaseAction({ premium, plan, className = 'btn btn-primary', disabled = false }) {
  if (premium.checkoutAvailable === false) {
    return (
      <a className={className} href={waitlistMailto(PLANS_PAGE.waitlistSubject)}>
        {PLANS_PAGE.waitlistAction}
      </a>
    );
  }
  return (
    <button type="button" className={className} onClick={() => premium.startCheckout(plan)} disabled={disabled || premium.busy}>
      {premium.busy ? PLANS_PAGE.premium.opening : PLANS_PAGE.upgradeAction}
    </button>
  );
}
