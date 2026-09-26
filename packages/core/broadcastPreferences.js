import { supabase } from './supabase.js';
import { GUIDE_REGIONS } from './broadcastGuide.js';

/** @typedef {{market_id: string | null, channel_ids: string[] | null}} BroadcastPreferences */
/** @type {BroadcastPreferences} */
export const EMPTY_BROADCAST_PREFERENCES = { market_id: null, channel_ids: null };

/** A market change resets the selection: IDs belong to one broadcast market.
 * null selects all channels, while [] deliberately selects none.
 * @param {BroadcastPreferences} value
 * @returns {BroadcastPreferences}
 */
export function validateBroadcastPreferences(value) {
  if (!GUIDE_REGIONS.some(m => m.id === value.market_id)) throw new Error('Unknown broadcast market');
  if (value.channel_ids !== null && (!Array.isArray(value.channel_ids) || value.channel_ids.length > 200 || value.channel_ids.some(id => typeof id !== 'string' || !id || id.length > 200))) throw new Error('Invalid broadcast channels');
  return { market_id: value.market_id, channel_ids: value.channel_ids === null ? null : [...new Set(value.channel_ids)] };
}

/** @param {string} userId @returns {Promise<BroadcastPreferences>} */
export async function loadBroadcastPreferences(userId) {
  const { data, error } = await supabase.from('broadcast_preferences').select('market_id,channel_ids').eq('user_id', userId).maybeSingle();
  if (error) throw error;
  return data ? validateBroadcastPreferences(data) : EMPTY_BROADCAST_PREFERENCES;
}

/** @param {string} userId @param {BroadcastPreferences} value */
export async function saveBroadcastPreferences(userId, value) {
  const next = validateBroadcastPreferences(value);
  const { data, error } = await supabase.from('broadcast_preferences').upsert({ user_id: userId, ...next }, { onConflict: 'user_id' }).select('market_id,channel_ids').single();
  if (error) throw error;
  return validateBroadcastPreferences(data);
}
