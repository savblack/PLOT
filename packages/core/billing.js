/** Authoritative entitlement read, shared by web and native callers. */
import { supabase } from './supabase.js';

/**
 * Billing UI must not infer a paid relationship from the cosmetic profile badge.
 * Failed or pending reads expose neither entitlement nor management controls.
 * @param {{ isPremium?: boolean, canManage?: boolean } | null | undefined} status
 */
export function billingAccess(status) {
  return {
    isPremium: status?.isPremium === true,
    canManage: status?.canManage === true,
  };
}

/**
 * Never fall back to profiles.is_premium: that cosmetic mirror can outlive a
 * subscription when no new webhook arrives. Server access checks remain final.
 * @param {{ rpc: (name: string) => PromiseLike<{data: unknown, error: unknown}> }} [client]
 * @returns {Promise<boolean>}
 */
export async function loadPremiumEntitlement(client = supabase) {
  try {
    const { data, error } = await client.rpc('is_premium');
    return !error && data === true;
  } catch {
    return false;
  }
}
