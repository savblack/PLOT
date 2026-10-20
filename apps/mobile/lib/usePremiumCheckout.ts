/**
 * Premium checkout on the phone. Plot never takes the payment in the app:
 * Upgrade asks stripe-billing for a Stripe Checkout URL for the signed-in user
 * and opens it in the phone's browser. When the person comes back to the app we
 * re-read their profile, because the webhook that grants Premium may already
 * have landed. Web does the same thing with a page redirect (usePremium.js).
 *
 * There is no in-app purchase and there will not be one (PLO-526, decided).
 * Upgrade and Manage subscription both open Stripe in the browser. Apple lets
 * an app link out to external purchase without an entitlement only on the US
 * storefront (@plot/core/purchaseLinkOut.js), so `allowed` is false until the
 * storefront is read and permits it, and both controls draw nothing elsewhere.
 *
 * `checkoutAvailable` follows billing-availability: true open, false closed
 * (the control becomes the waitlist, as on web), null not known yet (treated as
 * open, and a closed answer from the server is still mapped onto the closed state).
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { AppState, Linking, Platform } from 'react-native';
import { loadCheckoutAvailability } from '@plot/core/checkoutAvailability.js';
import { checkoutErrorMessage, checkoutPlan, requestBillingUrl, waitlistMailto } from '@plot/core/premiumCheckout.js';
import { canLinkOutToPurchase } from '@plot/core/purchaseLinkOut.js';
import { PLANS_PAGE } from '@plot/core/copy/plansPage.js';
import { useOptionalAppData } from '../contexts/AppDataContext';
import { BROWSER_CHECKOUT_ENABLED } from './launchFeatures';
import { getStorefrontCountry } from '../modules/plot-storefront';

export type CheckoutResult = 'opened' | 'closed' | 'failed';

export function usePremiumCheckout(active = true) {
  const appData = useOptionalAppData();
  const refreshProfile = appData?.refreshProfile;
  const [checkoutAvailable, setCheckoutAvailable] = useState<boolean | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [storefront, setStorefront] = useState<string | null>(null);
  const awaitingReturn = useRef(false);
  const allowed = BROWSER_CHECKOUT_ENABLED && canLinkOutToPurchase({ platform: Platform.OS, storefront });

  useEffect(() => {
    if (!active || !BROWSER_CHECKOUT_ENABLED) return;
    let on = true;
    getStorefrontCountry().then(c => { if (on) setStorefront(c); });
    return () => { on = false; };
  }, [active]);

  useEffect(() => {
    if (!active || !allowed) return;
    let on = true;
    loadCheckoutAvailability()
      .then((value: boolean | null) => { if (on && value !== null) setCheckoutAvailable(value); })
      .catch(() => {});
    return () => { on = false; };
  }, [active, allowed]);

  // Back from the browser: the Premium badge may have changed, so read it again
  // now and once more shortly after, in case the webhook is a few seconds behind.
  useEffect(() => {
    const sub = AppState.addEventListener('change', (state) => {
      if (state !== 'active' || !awaitingReturn.current) return;
      awaitingReturn.current = false;
      setBusy(false);
      refreshProfile?.();
      setTimeout(() => refreshProfile?.(), 5000);
    });
    return () => sub.remove();
  }, [refreshProfile]);

  const closed = checkoutAvailable === false;

  const start = useCallback(async (plan: string = 'monthly'): Promise<CheckoutResult> => {
    if (busy || !allowed) return 'failed';
    if (closed) return 'closed';
    setError(null);
    setBusy(true);
    try {
      const url = await requestBillingUrl('checkout', { plan: checkoutPlan(plan) });
      awaitingReturn.current = true;
      await Linking.openURL(url);
      return 'opened';
    } catch (e) {
      awaitingReturn.current = false;
      setBusy(false);
      const err = e as { status?: number; code?: string; message?: string };
      if (err?.code === 'premium_coming_soon') {
        setCheckoutAvailable(false);
        return 'closed';
      }
      setError(checkoutErrorMessage(err?.status, err?.message, PLANS_PAGE.checkoutMessage, {
        code: err?.code,
        closed: PLANS_PAGE.checkoutClosed,
        unavailable: PLANS_PAGE.checkoutUnavailable,
      }));
      return 'failed';
    }
  }, [busy, closed, allowed]);

  /** Stripe's customer portal (cancel, payment method, invoices) in the browser. */
  const openPortal = useCallback(async (): Promise<CheckoutResult> => {
    if (busy || !allowed) return 'failed';
    setError(null);
    setBusy(true);
    try {
      const url = await requestBillingUrl('portal');
      awaitingReturn.current = true;
      await Linking.openURL(url);
      return 'opened';
    } catch (e) {
      awaitingReturn.current = false;
      setBusy(false);
      setError((e as Error)?.message || PLANS_PAGE.checkoutUnavailable);
      return 'failed';
    }
  }, [busy, allowed]);

  /** While checkout is closed the control is the waitlist: no payment, just an email. */
  const joinWaitlist = useCallback(() => {
    void Linking.openURL(waitlistMailto(PLANS_PAGE.waitlistSubject)).catch(() => {});
  }, []);

  /** What the control says: Opening…, the waitlist, or Upgrade to Premium. */
  const label = busy ? PLANS_PAGE.premium.opening : closed ? PLANS_PAGE.waitlistAction : PLANS_PAGE.upgradeAction;

  return { allowed, checkoutAvailable, closed, busy, error, label, start, openPortal, joinWaitlist };
}
