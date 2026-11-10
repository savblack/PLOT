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
 * Whether the purchase button may promise the free trial ("Start free trial").
 *
 * The server grants the trial at checkout to anyone with no cancelled
 * subscription (supabase/functions/_shared/checkout.ts). The client cannot ask
 * Stripe, so it reads the same history from get_my_billing_status and only
 * says yes when that read succeeded and shows no subscription at all: not
 * Premium, no subscription id on record (canManage) and no status. Anything
 * else, including a failed or pending read and a signed-out visitor, is no.
 * That keeps the mistake one-sided: someone eligible may see "Upgrade to
 * Premium" and still get the trial, but nobody is promised a trial the server
 * will not give.
 *
 * @param {{ isPremium?: boolean, canManage?: boolean, status?: string | null } | null | undefined} status
 * @returns {boolean}
 */
export function trialEligible(status) {
  if (!status || typeof status !== 'object') return false;
  return status.isPremium === false && status.canManage === false && status.status == null;
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
