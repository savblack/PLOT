// The signed-in Go Premium link (core/goPremiumLink.js): a pink chip in the
// side nav just above the profile (desktop rail and the phone nav drawer),
// saying only "Go Premium", and the "Go Premium · 7 days free" line in the
// Settings account card. Both use the single Premium spark. It opens the existing Premium page, /pricing, where the
// existing Checkout lives; it never starts a checkout itself. Draws nothing
// for a Premium member, while billing is still being read, or signed out.
import { useLocation, useNavigate } from 'react-router-dom';
import { isPremiumProfile } from '@plot/core/premium.js';
import { trialEligible } from '@plot/core/billing.js';
import { goPremiumLink } from '@plot/core/goPremiumLink.js';
import { useBillingStatusResult } from '@plot/core/useBillingStatus.js';
import { EVENTS, track } from '../lib/analytics.js';
import { premiumPlansPath } from '../utils/premiumExplore.js';
import PremiumMark from './PremiumMark.jsx';
import './GoPremiumLink.css';

/** @param {{ id?: string | null, is_premium?: boolean } | null | undefined} profile */
function useGoPremiumLink(profile, variant) {
  const userId = profile?.id ?? null;
  const { data: billing, ready } = useBillingStatusResult(userId);
  return goPremiumLink({
    signedIn: !!userId,
    isPremium: isPremiumProfile(profile) || billing?.isPremium === true,
    billingReady: ready,
    trialEligible: trialEligible(billing),
    variant,
  });
}

/**
 * @param {{
 *   profile: { id?: string | null, is_premium?: boolean } | null | undefined,
 *   placement: 'side_nav' | 'settings',
 *   variant?: 'line' | 'chip',
 *   collapsed?: boolean,
 *   className?: string,
 *   labelClassName?: string,
 *   role?: string,
 *   onBeforeNavigate?: () => void,
 * }} props  onBeforeNavigate closes the menu or drawer the link sits in.
 *   The chip takes its host's nav-row classes (className: app-sidebar-item or
 *   nav-drawer-item, labelClassName: that row's label class), so it is exactly
 *   one nav row wide and tall, in the selected-pill blush (GoPremiumLink.css). `collapsed` (the folded desktop
 *   rail) draws it as the spark alone.
 */
export default function GoPremiumLink({ profile, variant = 'line', ...props }) {
  const link = useGoPremiumLink(profile, variant);
  // Router hooks only once there is a link to draw, so a host rendered outside
  // a router (a Storybook rail) still works when the link is hidden.
  if (!link) return null;
  return <GoPremiumAnchor link={link} variant={variant} {...props} />;
}

function GoPremiumAnchor({ link, placement, variant, collapsed = false, className, labelClassName, role, onBeforeNavigate }) {
  const navigate = useNavigate();
  const location = useLocation();
  const to = premiumPlansPath(`${location.pathname}${location.search}`);
  const go = (event) => {
    event.preventDefault();
    track(EVENTS.PREMIUM_LINK_CLICKED, { placement, trial: link.trial });
    onBeforeNavigate?.();
    navigate(to);
  };
  if (variant === 'chip') {
    return (
      <a
        href={to}
        className={`go-premium-chip${collapsed ? ' go-premium-chip--collapsed' : ''}${className ? ` ${className}` : ''}`}
        onClick={go}
        aria-label={collapsed ? link.label : undefined}
        title={collapsed ? link.label : undefined}
      >
        <span className="go-premium-chip-mark" aria-hidden="true"><PremiumMark /></span>
        {!collapsed && <span className={labelClassName}>{link.label}</span>}
      </a>
    );
  }
  return (
    <a href={to} role={role} className={`go-premium-link${className ? ` ${className}` : ''}`} onClick={go}>
      <span className="go-premium-link-mark" aria-hidden="true"><PremiumMark /></span>
      <span>{link.label}</span>
    </a>
  );
}
