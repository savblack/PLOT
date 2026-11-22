import { useCallback, useEffect, useRef, useState } from 'react';
import { supabase } from './supabase.js';
import { reportActionFailure, FAILED_ACTIONS } from './actionFailures.js';
import { findSavedComparison, withSavedComparison, withoutSavedComparison } from './savedComparisons.js';

/**
 * The viewer's saved comparisons (see savedComparisons.js for what is kept and
 * why). The list is the server's: list_saved_comparisons() already leaves out
 * anyone blocked in either direction. `save` and `remove` change the copy on
 * screen at once and then tell the server.
 *
 * Mount it once per screen and pass the result down, so one list is on screen.
 *
 * @param {string | null | undefined} viewerId
 */
export function useSavedComparisons(viewerId) {
  const [saved, setSaved] = useState(/** @type {import('./savedComparisons.js').SavedComparison[]} */ ([]));
  const list = useRef(saved);
  const show = useCallback((next) => { list.current = next; setSaved(next); }, []);

  // Also for a screen that stays mounted while another one saves (mobile's
  // picker under the comparison): call it when the screen comes back.
  const reload = useCallback(async () => {
    if (!viewerId) return;
    const { data, error } = await supabase.rpc('list_saved_comparisons');
    if (!error && Array.isArray(data)) show(data);
  }, [viewerId, show]);

  // eslint-disable-next-line react-hooks/set-state-in-effect -- load the list when the viewer is known
  useEffect(() => { void reload(); }, [reload]);

  /**
   * Call when a comparison has loaded. A background save: a failure leaves
   * the row on screen for this visit and is not reported as a user action.
   * @param {{ id?: string | null, username?: string | null, display_name?: string | null, avatar_url?: string | null } | null | undefined} person
   */
  const save = useCallback((person) => {
    if (!viewerId || !person?.id || !person.username) return;
    show(withSavedComparison(list.current, person));
    supabase.rpc('save_comparison', { p_target: person.id }).then(() => {}, () => {});
  }, [viewerId, show]);

  /**
   * The x on a row, or a person the server no longer lets you compare with.
   * @param {string | null | undefined} username
   * @returns {Promise<boolean>} false when the server refused; the row is back
   */
  const remove = useCallback(async (username) => {
    const row = findSavedComparison(list.current, username);
    if (!viewerId || !row) return true;
    show(withoutSavedComparison(list.current, username));
    if (!row.id) return true;
    const { error } = await supabase.rpc('remove_saved_comparison', { p_target: row.id });
    if (!error) return true;
    reportActionFailure(FAILED_ACTIONS.SAVED_COMPARISON_REMOVE, error);
    await reload();
    return false;
  }, [viewerId, show, reload]);

  return { saved, save, remove, reload };
}
