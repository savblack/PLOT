// Browser navigation and beacon transport are web-specific. Native parity: https://github.com/savblack/PLOT/issues/1459.
import { useCallback, useEffect, useState } from 'react';
import { supabase } from '@plot/core/supabase.js';
import { loadCheckoutAvailability } from '@plot/core/checkoutAvailability.js';
import { track, EVENTS } from '../lib/analytics.js';
import { useBillingStatusResult } from '@plot/core/useBillingStatus.js';
import { billingAccess, trialEligible } from '@plot/core/billing.js';
import { PLANS_PAGE } from '../copy/plansPage.js';
import { checkoutErrorMessage, checkoutPlan, redirectToCheckout, requestBillingUrl, signupPathForPlan } from '../utils/premiumCheckout.js';

/**
 * Plot Premium billing actions (web only — redirects to Stripe).
 *
 * Billing status comes from the authenticated get_my_billing_status() RPC.
 * The persisted badge alone is neither an entitlement nor a billing relationship.
 * Server-side gates (RLS + edge functions) are the authority; this hook just
 * previews upcoming subscriptions / opens the Stripe customer portal.
 */
// The Stripe URL request is shared with the phone app (@plot/core/premiumCheckout.js).
const callBilling = requestBillingUrl;

// Users the server has refused a promised trial to, for the life of the page.
// Kept outside the hook: every upgrade sheet mounts its own usePremium, so
// state inside it would forget the refusal the moment the sheet closed and
// offer the trial again on the next one.
const trialRefusedFor = new Set();

export function usePremium(profile) {
  const userId = profile?.id ?? null;
  const { data: billing, ready: billingReady } = useBillingStatusResult(userId);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  // null until billing-availability answers. false is the closed state: the
  // purchase control becomes a waitlist and startCheckout does not call Stripe.
  const [checkoutAvailable, setCheckoutAvailable] = useState(null);
  // The server refused a promised trial (Stripe knows of an earlier
  // subscription Plot's record does not). Stop promising it in this session.
  const [trialRefused, setTrialRefused] = useState(() => trialRefusedFor.has(userId));
  const promisesTrial = !trialRefused && !trialRefusedFor.has(userId) && trialEligible(billing);

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
    // Busy from the first moment, before the availability read: the plan
    // rows lock, so the plan on screen is the plan that is sent, and a second
    // press cannot start a second request.
    setBusy(true);
    if (checkoutAvailable !== true) {
      const fresh = await loadCheckoutAvailability();
      if (fresh === false) {
        setCheckoutAvailable(false);
        setBusy(false);
        return false;
      }
      if (fresh === true) setCheckoutAvailable(true);
    }
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (session) {
        await redirectToCheckout(chosen, {
          request: callBilling,
          navigate: url => window.location.assign(url),
          track: (event, props) => track(event, props, { transport: 'sendBeacon', send_instantly: true }),
          expectTrial: promisesTrial,
        });
      } else {
        window.location.assign(signupPathForPlan(chosen));
      }
      return true;
    } catch (e) {
      if (e?.code === 'premium_coming_soon') {
        setCheckoutAvailable(false);
        setBusy(false);
        return false;
      }
      // Nothing was charged or created. The button becomes Upgrade to Premium
      // and the server's sentence says why; pressing it again is a plain checkout.
      if (e?.code === 'trial_unavailable') {
        if (userId) trialRefusedFor.add(userId);
        setTrialRefused(true);
      }
      setError(checkoutErrorMessage(e?.status, e?.message, PLANS_PAGE.checkoutMessage, {
        code: e?.code,
        closed: PLANS_PAGE.checkoutClosed,
        unavailable: PLANS_PAGE.checkoutUnavailable,
      }));
      setBusy(false);
      return false;
    }
  }, [busy, checkoutAvailable, promisesTrial, userId]);

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
    // False only while the first billing read for this viewer is still out.
    billingReady,
    // The button may say Start free trial: a signed-in viewer with no
    // subscription on Plot's record, and the server has not said otherwise.
    trialEligible: promisesTrial,
    startCheckout,
    startTipCheckout,
    openPortal,
    busy,
    error,
    checkoutAvailable,
  };
}
