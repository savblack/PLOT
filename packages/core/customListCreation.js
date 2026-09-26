import { CUSTOM_LISTS } from './copy/customLists.js';

export const CUSTOM_LIST_LIMIT_CODE = 'custom_list_limit_reached';

/** Preserve the cap message across creation surfaces, including stale tabs. */
export function customListCreationError(error, fallback) {
  return error?.code === CUSTOM_LIST_LIMIT_CODE ? CUSTOM_LISTS.limitMessage : fallback;
}

/** Insert through the database cap; do not infer entitlement from a stale profile.
 * @param {any} client Supabase client, injected for isolated tests.
 * @param {string} userId
 * @param {string} name
 * @returns {Promise<any>}
 */
export async function createCustomListRecord(client, userId, name) {
  const { data, error } = await client.from('user_custom_lists')
    .insert({ user_id: userId, name: name.trim() }).select().single();
  if (!error) return data;
  let atLimit = error.message === CUSTOM_LIST_LIMIT_CODE;
  // Older servers report the RLS rejection instead of the explicit trigger error.
  if (!atLimit && error.code === '42501') {
    const result = await client.rpc('can_create_custom_list');
    atLimit = !result.error && result.data === false;
  }
  if (atLimit) throw Object.assign(new Error(CUSTOM_LISTS.limitMessage), { code: CUSTOM_LIST_LIMIT_CODE });
  throw error;
}
