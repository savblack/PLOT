import { useCallback, useState } from 'react';
import { supabase } from '../api/supabase.js';
import { edgeFunctionUrl } from '../api/functions.js';
import { track, EVENTS } from '../lib/analytics.js';
import { isPremiumProfile } from '../core/premium.js';

/**
 * PLOT Premium billing actions (web only — redirects to Stripe).
 *
 * Premium *status* comes from profile.is_premium, already loaded by
 * App.jsx's profile select and mirrored by the stripe-webhook edge function.
 * Server-side gates (RLS + edge functions) are the authority; this hook just
 * starts checkout / opens the Stripe customer portal.
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
  if (!res.ok || !data?.url) throw new Error(data?.error || 'Billing request failed');
  return data.url;
}

export function usePremium(profile) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);

  const startCheckout = useCallback(async (plan = 'monthly', source = 'settings') => {
    if (busy) return;
    setBusy(true);
    setError(null);
    track(EVENTS.PREMIUM_CHECKOUT_STARTED, { plan, source });
    try {
      window.location.assign(await callBilling('checkout', { plan }));
    } catch (e) {
      setError(e.message);
      setBusy(false);
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

  return {
    isPremium: isPremiumProfile(profile),
    startCheckout,
    openPortal,
    busy,
    error,
  };
}
