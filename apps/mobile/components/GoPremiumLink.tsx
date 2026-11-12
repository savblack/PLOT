/**
 * The signed-in Go Premium link (@plot/core/goPremiumLink.js): a pink chip in
 * the drawer just above the profile row, saying only "Go Premium", and the
 * "Go Premium · 7 days free" line in the Settings account card. It opens the
 * existing Premium page, Settings › Premium (PREMIUM_SETTINGS_PATH), where the
 * existing browser Checkout lives; it never starts a checkout itself.
 *
 * Like that Upgrade button, it only draws where the phone may link out to
 * purchase (usePremiumCheckout().allowed: the US storefront), so nobody is
 * offered a trial they cannot start. Also nothing for a Premium member, while
 * billing is still being read, or signed out.
 */
import Svg, { Path } from 'react-native-svg';
import { trialEligible } from '@plot/core/billing.js';
import { ICON_PATHS } from '@plot/core/icons.js';
import { goPremiumLink } from '@plot/core/goPremiumLink.js';
import { isPremiumProfile } from '@plot/core/premium.js';
import { useBillingStatusResult } from '@plot/core/useBillingStatus.js';
import { EVENTS, track } from '../lib/analytics';
import { usePremiumCheckout } from '../lib/usePremiumCheckout';

export type GoPremiumPlacement = 'side_nav' | 'settings';

/** `active` false skips the billing and storefront reads (a closed menu). */
export function useGoPremiumLink(
  userId: string | null | undefined,
  profile: { is_premium?: boolean | null } | null | undefined,
  active = true,
  variant: 'line' | 'chip' = 'line',
) {
  const { data: billing, ready } = useBillingStatusResult(active ? userId ?? null : null);
  const checkout = usePremiumCheckout(active);
  if (!active || !userId || !checkout.allowed) return null;
  const link = goPremiumLink({
    signedIn: true,
    isPremium: isPremiumProfile(profile) || billing?.isPremium === true,
    billingReady: ready,
    trialEligible: trialEligible(billing),
    variant,
  });
  if (!link) return null;
  return {
    ...link,
    /** Track the tap; the caller then opens the Premium page. */
    tap: (placement: GoPremiumPlacement) => track(EVENTS.PREMIUM_LINK_CLICKED, { placement, trial: link.trial }),
  };
}

/** The single Premium spark (ICON_PATHS.spark, the same glyph as web), solid. */
export function GoPremiumSpark({ color, size = 18 }: { color: string; size?: number }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill={color} accessibilityElementsHidden importantForAccessibility="no">
      <Path d={ICON_PATHS.spark} />
    </Svg>
  );
}
