import { useCallback, useState } from 'react';
import { supabase } from '@plot/core/supabase.js';
import { edgeFunctionUrl } from '@plot/core/functions.js';
import { track, EVENTS } from '../lib/analytics.js';
import { useBillingStatus } from '@plot/core/useBillingStatus.js';
import { billingAccess } from '@plot/core/billing.js';
import { PLANS_PAGE } from '../copy/plansPage.js';
import { checkoutErrorMessage, checkoutPlan, signupPathForPlan } from '../utils/premiumCheckout.js';

/**
 * Plot Premium billing actions (web only — redirects to Stripe).
 *
 * Billing status comes from the authenticated get_my_billing_status() RPC.
 * The persisted badge alone is neither an entitlement nor a billing relationship.
 * Server-side gates (RLS + edge functions) are the authority; this hook just
 * previews upcoming subscriptions / opens the Stripe customer portal.
 */
async function callBilling(action, body = {}) {
  const { data: { session } } = await supabase.auth.getSession();
  const url = edgeFunctionUrl('stripe-billing', { action });
  if (!session || !url) throw new Error('Not signed in');
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${session.access_token}`,
    },
    body: JSON.stringify(body),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok || !data?.url) throw Object.assign(new Error(data?.error || 'Billing request failed'), { status: res.status });
  return data.url;
}

export function usePremium(profile) {
  const billing = useBillingStatus(profile?.id);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);

  // Resolves true once the browser is on its way to Stripe (or to sign-up for a
  // signed-out visitor), false when checkout could not start. The server decides
  // whether checkout is open; a closed or failed start shows the generic message.
  const startCheckout = useCallback(async (plan) => {
    if (busy) return false;
    const chosen = checkoutPlan(plan);
    setBusy(true);
    setError(null);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      window.location.assign(session ? await callBilling('checkout', { plan: chosen }) : signupPathForPlan(chosen));
      return true;
    } catch (e) {
      setError(checkoutErrorMessage(e.status, e.message, PLANS_PAGE.checkoutMessage));
      setBusy(false);
      return false;
    }
  }, [busy]);

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
  };
}
