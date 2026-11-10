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
 * The server grants the trial at checkout to anyone Stripe shows no cancelled
 * subscription for (supabase/functions/_shared/checkout.ts). The client cannot
 * ask Stripe. It reads Plot's own record through get_my_billing_status and
 * says yes only when that read succeeded and shows nothing: not Premium, not
 * manageable (canManage, which needs a Stripe customer and a subscription id)
 * and no status. A failed or pending read and a signed-out visitor are no.
 *
 * Plot's record can disagree with Stripe (a missed webhook, a restore), so
 * this is a label, not the decision. The checkout request says the trial was
 * promised (`expectTrial`) and the server refuses instead of charging when
 * Stripe says otherwise; usePremium then drops the promise.
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
