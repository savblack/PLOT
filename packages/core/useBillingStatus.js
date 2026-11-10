import { useEffect, useState } from 'react';
import { supabase } from './supabase.js';

// The last answer per user, kept for the life of the page. A surface that
// mounts later (the upgrade sheet opens long after the app has loaded) starts
// from it rather than from "unknown", so it does not first draw as if nobody
// had a subscription and then redraw. A fresh read still follows on mount.
/** @type {Map<string, unknown>} */
const lastKnown = new Map();

/**
 * The billing read and whether it has answered yet.
 *
 * `ready` is false only while nothing is known: the first read for this user
 * has not come back. It is true once a read has answered, including with an
 * error (`data` is then null), and true at once for a signed-out viewer, who
 * has no billing to wait for.
 *
 * @param {string | null | undefined} userId
 * @returns {{ data: any, ready: boolean }}
 */
export function useBillingStatusResult(userId) {
  const [result, setResult] = useState(() => (userId && lastKnown.has(userId) ? { userId, data: lastKnown.get(userId) } : null));
  useEffect(() => {
    if (!userId) return;
    let active = true;
    const load = async () => {
      try {
        const { data, error } = await supabase.rpc('get_my_billing_status');
        // A failed read shows nothing, as it always has: billing UI must not
        // keep an entitlement or a portal link it can no longer confirm. So it
        // is not remembered either.
        if (error) lastKnown.delete(userId); else lastKnown.set(userId, data);
        if (active) setResult({ userId, data: error ? null : data });
      } catch {
        lastKnown.delete(userId);
        if (active) setResult({ userId, data: null });
      }
    };
    void load();
    const timer = setInterval(load, 60_000);
    return () => { active = false; clearInterval(timer); };
  }, [userId]);
  if (!userId) return { data: null, ready: true };
  const current = result && result.userId === userId ? result : (lastKnown.has(userId) ? { data: lastKnown.get(userId) } : null);
  return { data: current ? current.data : null, ready: current !== null };
}

/** A billing relationship survives entitlement expiry, so portal access does too. */
export function useBillingStatus(userId) {
  return useBillingStatusResult(userId).data;
}

/** For tests: forget every remembered answer. */
export function clearBillingStatusCache() {
  lastKnown.clear();
}
