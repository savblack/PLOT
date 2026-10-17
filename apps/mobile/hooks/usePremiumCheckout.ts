/**
 * Start Plot Premium checkout from mobile. Asks the same stripe-billing edge
 * function web does (@plot/core/premiumCheckout.js) for a Stripe Checkout URL
 * and opens it in the browser. When billing-availability says checkout is
 * closed, the button becomes the waitlist, exactly as on web.
 *
 * Stripe sends the person back to the web app after paying. When the app next
 * comes to the foreground the profile is reloaded, and once more a few seconds
 * later because the webhook that turns Premium on can trail the redirect.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { AppState, Linking } from 'react-native';
import { PLANS_PAGE } from '@plot/core/copy/plansPage.js';
import { loadCheckoutAvailability } from '@plot/core/checkoutAvailability.js';
import { requestPremiumCheckout, waitlistMailto } from '@plot/core/premiumCheckout.js';
import { useAppData } from '../contexts/AppDataContext';

const WEBHOOK_LAG_MS = 4000;

export default function usePremiumCheckout() {
  const { refreshProfile } = useAppData();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // null until billing-availability answers; false is the closed (waitlist) state.
  const [open, setOpen] = useState<boolean | null>(null);
  const awaitingReturn = useRef(false);

  useEffect(() => {
    let active = true;
    loadCheckoutAvailability().then(v => { if (active && v !== null) setOpen(v); }).catch(() => {});
    return () => { active = false; };
  }, []);

  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | undefined;
    const sub = AppState.addEventListener('change', state => {
      if (state !== 'active' || !awaitingReturn.current) return;
      awaitingReturn.current = false;
      refreshProfile();
      timer = setTimeout(refreshProfile, WEBHOOK_LAG_MS);
    });
    return () => { sub.remove(); if (timer) clearTimeout(timer); };
  }, [refreshProfile]);

  const closed = open === false;

  const act = useCallback(async (plan: string = 'monthly') => {
    if (busy) return;
    if (closed) {
      void Linking.openURL(waitlistMailto(PLANS_PAGE.waitlistSubject)).catch(() => {});
      return;
    }
    setBusy(true);
    setError(null);
    const out = await requestPremiumCheckout(plan);
    if (out.kind === 'url') {
      awaitingReturn.current = true;
      try { await Linking.openURL(out.url); } catch { awaitingReturn.current = false; setError(PLANS_PAGE.checkoutMessage); }
    } else if (out.kind === 'closed') {
      setOpen(false);
    } else {
      setError(out.message);
    }
    setBusy(false);
  }, [busy, closed]);

  /** What the purchase control says: Opening…, the waitlist, or Upgrade to Premium. */
  const label = busy ? PLANS_PAGE.premium.opening : closed ? PLANS_PAGE.waitlistAction : PLANS_PAGE.upgradeAction;

  return { act, busy, closed, error, label };
}
