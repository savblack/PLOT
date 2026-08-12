/* Writing to `profiles`.
 *
 * Kept apart from profileFields.js, which stays pure (shape, validation,
 * section rules) and so is testable without a client. This module is the one
 * place a profile row is written.
 *
 * There were eighteen open-coded copies of the write before this, twelve in
 * apps/web/src/components/SettingsView.jsx alone, each repeating
 * `.update(patch).eq('id', userId)` with its own error handling. Concentrating
 * them means a change to how a profile write behaves — a retry, an audit
 * trail, a cache invalidation — lands once instead of eighteen times.
 */
import { supabase } from './supabase.js';

/**
 * Apply a partial update to a user's profile.
 *
 * @param {{ userId: string, patch: Record<string, any> }} args
 * @returns {Promise<{ data: any, error: any }>} `data` is the updated row when
 *   the write succeeded, so callers can use it instead of re-reading.
 */
export async function updateProfile({ userId, patch }) {
  if (!userId || !patch || !Object.keys(patch).length) {
    return { data: null, error: null };
  }

  const { data, error } = await supabase
    .from('profiles')
    .update(patch)
    .eq('id', userId)
    .select()
    .maybeSingle();

  return { data, error };
}

/**
 * Create or replace a profile row.
 *
 * Onboarding needs this rather than updateProfile: the row may not exist yet,
 * and `.update()` against a missing row succeeds while changing nothing, which
 * would silently drop the user's first name and region.
 *
 * @param {{ userId: string, patch: Record<string, any> }} args
 * @returns {Promise<{ data: any, error: any }>}
 */
export async function upsertProfile({ userId, patch }) {
  if (!userId) return { data: null, error: null };

  const { data, error } = await supabase
    .from('profiles')
    .upsert({ id: userId, ...patch })
    .select()
    .maybeSingle();

  return { data, error };
}
