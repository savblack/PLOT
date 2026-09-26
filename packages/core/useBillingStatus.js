import { useEffect, useState } from 'react';
import { supabase } from './supabase.js';

/** A billing relationship survives entitlement expiry, so portal access does too. */
export function useBillingStatus(userId) {
  const [result, setResult] = useState(null);
  useEffect(() => {
    if (!userId) return;
    let active = true;
    const load = async () => {
      try {
        const { data, error } = await supabase.rpc('get_my_billing_status');
        if (active) setResult({ userId, data: error ? null : data });
      } catch {
        if (active) setResult({ userId, data: null });
      }
    };
    void load();
    const timer = setInterval(load, 60_000);
    return () => { active = false; clearInterval(timer); };
  }, [userId]);
  return result?.userId === userId ? result.data : null;
}
