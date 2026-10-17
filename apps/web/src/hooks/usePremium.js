import { useCallback, useEffect, useState } from 'react';
import { supabase } from '@plot/core/supabase.js';
import { loadCheckoutAvailability } from '@plot/core/checkoutAvailability.js';
import { track, EVENTS } from '../lib/analytics.js';
import { useBillingStatus } from '@plot/core/useBillingStatus.js';
import { billingAccess } from '@plot/core/billing.js';
import { PLANS_PAGE } from '../copy/plansPage.js';
import { checkoutErrorMessage, checkoutPlan, fetchBillingUrl, signupPathForPlan } from '../utils/premiumCheckout.js';

/**
 * Plot Premium billing actions (web only — redirects to Stripe).
 *
 * Billing status comes from the authenticated get_my_billing_status() RPC.
 * The persisted badge alone is neither an entitlement nor a billing relationship.
 * Server-side gates (RLS + edge functions) are the authority; this hook just
 * previews upcoming subscriptions / opens the Stripe customer portal.
 */
const callBilling = fetchBillingUrl;

export function usePremium(profile) {
  const billing = useBillingStatus(profile?.id);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  // null until billing-availability answers. false is the closed state: the
  // purchase control becomes a waitlist and startCheckout does not call Stripe.
  const [checkoutAvailable, setCheckoutAvailable] = useState(null);

  useEffect(() => {
    let active = true;
    loadCheckoutAvailability()
      .then(value => { if (active && value !== null) setCheckoutAvailable(value); })
      .catch(() => {});
    return () => { active = false; };
  }, [profile?.id]);

  // Resolves true once the browser is on its way to Stripe (or to sign-up when
  // checkout is open and the visitor is signed out). False when checkout is
  // closed or the call failed. A closed switch is not a generic error.
  const startCheckout = useCallback(async (plan) => {
    if (busy) return false;
    const chosen = checkoutPlan(plan);
    setError(null);
    if (checkoutAvailable !== true) {
      const fresh = await loadCheckoutAvailability();
      if (fresh === false) {
        setCheckoutAvailable(false);
        return false;
      }
      if (fresh === true) setCheckoutAvailable(true);
    }
    setBusy(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      window.location.assign(session ? await callBilling('checkout', { plan: chosen }) : signupPathForPlan(chosen));
      return true;
    } catch (e) {
      if (e?.code === 'premium_coming_soon') {
        setCheckoutAvailable(false);
        setBusy(false);
        return false;
      }
      setError(checkoutErrorMessage(e?.status, e?.message, PLANS_PAGE.checkoutMessage, {
        code: e?.code,
        closed: PLANS_PAGE.checkoutClosed,
        unavailable: PLANS_PAGE.checkoutUnavailable,
      }));
      setBusy(false);
      return false;
    }
  }, [busy, checkoutAvailable]);

  const openPortal = useCallback(async () => {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      window.location.assign(await callBilling('portal'));
    } catch (e) {
      setError(e.message);
      setBusy(false);
    }
  }, [busy]);

  const startTipCheckout = useCallback(async (amount, source = 'settings') => {
    if (busy) return;
    setBusy(true);
    setError(null);
    track(EVENTS.TIP_JAR_CLICKED, { source, amount });
    try {
      window.location.assign(await callBilling('tip', { amount }));
    } catch (e) {
      setError(e.message);
      setBusy(false);
    }
  }, [busy]);

  return {
    ...billingAccess(billing),
    billing,
    startCheckout,
    startTipCheckout,
    openPortal,
    busy,
    error,
    checkoutAvailable,
  };
}
