// Database work stays out of the eager prompt channel used by public pages.
import { hasFeltValue } from './hasFeltValue.js';
import { peekPremiumTrialPrompt, requestPremiumTrialPrompt } from './premiumTrialPrompt.js';
import { supabase } from './supabase.js';

/**
 * Only the caller's profile is read. Unknown (including a missing migration)
 * fails closed for natural moments.
 * @param {string | null | undefined} userId
 * @param {{ client?: any }} [options]
 * @returns {Promise<boolean | null>}
 */
export async function readPremiumTrialPromptDeferral(userId, { client = supabase } = {}) {
  if (!userId) return null;
  try {
    const { data, error } = await client.from('profiles')
      .select('premium_trial_prompt_deferred_at').eq('id', userId).maybeSingle();
    if (error || !data) return null;
    return data.premium_trial_prompt_deferred_at != null;
  } catch { return null; }
}

/**
 * `true` persists a suppression. `false` atomically claims and clears one,
 * returning false when another device has already claimed it.
 * @param {string | null | undefined} userId
 * @param {boolean} deferred
 * @param {{ client?: any }} [options]
 * @returns {Promise<boolean>}
 */
export async function setPremiumTrialPromptDeferral(userId, deferred, { client = supabase } = {}) {
  if (!userId) return false;
  try {
    const { data, error } = await client.rpc('set_premium_trial_prompt_deferral', { p_user_id: userId, p_deferred: deferred });
    return !error && data === true;
  } catch { return false; }
}

/**
 * Drop a deferred marker only when the billing answer establishes that this
 * account cannot receive the trial. A failed billing read is not an answer.
 * @param {{ userId: string, isPremium: boolean, trialEligible: boolean, billingKnown: boolean, client?: any }} input
 */
export async function clearIneligiblePremiumTrialPromptDeferral({ userId, isPremium, trialEligible, billingKnown, client = supabase }) {
  if (!isPremium && !(billingKnown && trialEligible === false)) return false;
  return setPremiumTrialPromptDeferral(userId, false, { client });
}

/**
 * Rebuild a deferred request after a reload or on another device. The caller
 * supplies its platform's seen-key read; neither count alone creates an offer.
 * @param {{ userId: string | null | undefined, titleCount: number | null, sessionCount: number | null,
 *   readSeen: (userId: string) => Promise<boolean | null> | boolean | null, client?: any,
 *   isCurrent?: () => boolean }} input
 * @returns {Promise<import('./premiumTrialPrompt.js').PremiumTrialPromptTrigger | null>}
 */
export async function requestDeferredPremiumTrialPrompt({ userId, titleCount, sessionCount, readSeen, client = supabase, isCurrent = () => true }) {
  if (!userId || !hasFeltValue({ titleCount, sessionCount }) || peekPremiumTrialPrompt()) return null;
  try {
    if (await readSeen(userId) !== false) return null;
  } catch { return null; }
  if (await readPremiumTrialPromptDeferral(userId, { client }) !== true) return null;
  if (!isCurrent() || peekPremiumTrialPrompt()) return null;
  const trigger = Number.isInteger(titleCount) && titleCount >= 5 ? 'fifth_title' : 'second_session';
  requestPremiumTrialPrompt(trigger);
  return trigger;
}

/**
 * Commit the server transition before either app writes its local seen key.
 * An immediate onboarding/import offer has no prior suppression to claim.
 * @param {{ userId: string, trigger: import('./premiumTrialPrompt.js').PremiumTrialPromptTrigger, decision: 'discard' | 'show' | 'wait' | 'suppress',
 *   wasSuppressed: boolean, client?: any }} input
 * @returns {Promise<'discard' | 'show' | 'show_deferred' | 'wait' | 'suppress'>}
 */
export async function preparePremiumTrialPromptDecision({ userId, trigger, decision, wasSuppressed, client = supabase }) {
  if (decision === 'suppress') {
    if (trigger !== 'onboarding' && trigger !== 'trakt_import') return 'wait';
    return await setPremiumTrialPromptDeferral(userId, true, { client }) ? 'suppress' : 'wait';
  }
  if (decision !== 'show') return decision;
  if (wasSuppressed || trigger === 'fifth_title' || trigger === 'second_session') {
    return await setPremiumTrialPromptDeferral(userId, false, { client }) ? 'show_deferred' : 'wait';
  }
  const deferred = await readPremiumTrialPromptDeferral(userId, { client });
  if (deferred === null) return 'wait';
  if (deferred && !await setPremiumTrialPromptDeferral(userId, false, { client })) return 'wait';
  return deferred ? 'show_deferred' : 'show';
}
