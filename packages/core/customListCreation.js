import { CUSTOM_LISTS } from './copy/customLists.js';

export const CUSTOM_LIST_LIMIT_CODE = 'custom_list_limit_reached';
/** Raised by the database when someone without Premium writes smart list rules. */
export const SMART_LIST_PREMIUM_CODE = 'smart_list_premium_required';

/** True when the server refused a new list because the Free cap is reached
 * (a stale tab can think it has room). Callers open the upgrade sheet for it. */
export function isCustomListLimitError(error) {
  return error?.code === CUSTOM_LIST_LIMIT_CODE;
}

/** Preserve the cap message across creation surfaces, including stale tabs. */
export function customListCreationError(error, fallback) {
  return isCustomListLimitError(error) ? CUSTOM_LISTS.limitMessage : fallback;
}

/** True when the server refused smart list rules because the account is not
 * Premium (a stale tab can think it is). Callers open the upgrade sheet for it. */
export function isSmartListPremiumError(error) {
  return error?.code === SMART_LIST_PREMIUM_CODE;
}

/** Insert through the database cap; do not infer entitlement from a stale profile.
 * @param {any} client Supabase client, injected for isolated tests.
 * @param {string} userId
 * @param {string} name
 * @param {{ rules?: import('./smartLists.js').SmartListRules | null }} [options]
 *   rules makes it a smart list; the database only accepts them from Premium.
 * @returns {Promise<any>}
 */
export async function createCustomListRecord(client, userId, name, { rules = null } = {}) {
  const row = rules ? { user_id: userId, name: name.trim(), rules } : { user_id: userId, name: name.trim() };
  const { data, error } = await client.from('user_custom_lists')
    .insert(row).select().single();
  if (!error) return data;
  if (error.message === SMART_LIST_PREMIUM_CODE) {
    throw Object.assign(new Error(SMART_LIST_PREMIUM_CODE), { code: SMART_LIST_PREMIUM_CODE });
  }
  let atLimit = error.message === CUSTOM_LIST_LIMIT_CODE;
  // Older servers report the RLS rejection instead of the explicit trigger error.
  if (!atLimit && error.code === '42501') {
    const result = await client.rpc('can_create_custom_list');
    atLimit = !result.error && result.data === false;
  }
  if (atLimit) throw Object.assign(new Error(CUSTOM_LISTS.limitMessage), { code: CUSTOM_LIST_LIMIT_CODE });
  throw error;
}
