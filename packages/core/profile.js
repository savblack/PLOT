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
import { getConfig } from './config.js';
import { reportActionFailure, FAILED_ACTIONS } from './actionFailures.js';

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

  // Analytics seam (see config.js). Every profile write in either app funnels
  // through here, so this is the generic backstop that catches settings changes
  // nobody instrumented by hand — it carries the changed *field names* only,
  // never their values. The specific events (profile_visibility_changed,
  // marketing_emails_opted_in, …) still fire alongside it at their own call
  // sites; they're the ones funnels are built on, this one is coverage.
  if (!error) getConfig().onProfileUpdate?.({ fields: Object.keys(patch) });
  else reportActionFailure(FAILED_ACTIONS.PROFILE_UPDATE, error, { fields: Object.keys(patch) });

  return { data, error };
}

/**
 * Save onboarding fields to an existing profile, or create a missing row.
 *
 * The signup trigger normally creates the row. A merge upsert sends `id` in
 * its UPDATE clause, but signed-in users deliberately cannot update that
 * column. Keep the missing-row fallback without requiring that privilege.
 *
 * @param {{ userId: string, patch: Record<string, any> }} args
 * @returns {Promise<{ data: any, error: any }>}
 */
export async function upsertProfile({ userId, patch }) {
  if (!userId) return { data: null, error: null };

  // The row key is never an editable onboarding field, even if a caller
  // accidentally includes it in a patch.
  const { id: _id, ...fields } = patch ?? {};
  const update = () => supabase.from('profiles')
    .update(fields).eq('id', userId).select().maybeSingle();
  let result;
  try {
    result = await update();
    if (!result.error && !result.data) {
      result = await supabase.from('profiles')
        .insert({ id: userId, ...fields }).select().maybeSingle();
      // The signup trigger may create the profile between update and insert.
      if (result.error?.code === '23505') result = await update();
    }
  } catch (error) {
    // Both apps use the returned error to leave the saving state and offer retry.
    result = { data: null, error };
  }

  const { data, error } = result;
  if (error || !data) {
    reportActionFailure(FAILED_ACTIONS.PROFILE_UPDATE, error, { fields: Object.keys(fields) });
    return { data: null, error: error || { message: 'Profile save returned no row' } };
  }

  return { data, error };
}
