// Who can see your watchlist ("Want to Watch"). The rule itself lives in the
// database (can_view_watchlist, supabase/migrations/20260927150000_watchlist_visibility.sql);
// this mirrors how the stored setting reads so both apps show the same choice.
// Change the two together, never one of them.
import { useState, useEffect, useCallback } from 'react';
import { supabase } from './supabase.js';
import { reportActionFailure, FAILED_ACTIONS } from './actionFailures.js';
import { updateProfile } from './profile.js';

/** @typedef {'everyone' | 'followers' | 'selected' | 'private'} WatchlistVisibility */

/** @type {readonly WatchlistVisibility[]} */
export const WATCHLIST_VISIBILITIES = Object.freeze(['everyone', 'followers', 'selected', 'private']);

/**
 * The setting that applies now. Unset means everyone for a public profile and
 * only you for a private one; "everyone" on a private profile also means only
 * you, so going private never leaves the watchlist open.
 * @param {{ is_public?: boolean | null, watchlist_visibility?: string | null } | null | undefined} profile
 * @returns {WatchlistVisibility}
 */
export function effectiveWatchlistVisibility(profile) {
  const isPublic = !!profile?.is_public;
  const stored = profile?.watchlist_visibility;
  if (!stored || !WATCHLIST_VISIBILITIES.includes(/** @type {WatchlistVisibility} */ (stored))) {
    return isPublic ? 'everyone' : 'private';
  }
  if (stored === 'everyone' && !isPublic) return 'private';
  return /** @type {WatchlistVisibility} */ (stored);
}

/**
 * The choices to offer. A private profile has no "everyone": its watchlist can
 * never be wider than its followers plus the people you pick.
 * @param {boolean} isPublic
 * @returns {WatchlistVisibility[]}
 */
export function watchlistVisibilityOptions(isPublic) {
  return isPublic ? [...WATCHLIST_VISIBILITIES] : ['followers', 'selected', 'private'];
}

/**
 * The signed-in user's watchlist setting. The column is read on its own, not
 * in either app's profile select, so a client that ships before the migration
 * is live still loads (it just reads as the default until then).
 *
 * @param {string | null | undefined} userId
 * @param {boolean} isPublic The viewer's current profile visibility, from the app's profile.
 */
export function useWatchlistVisibility(userId, isPublic) {
  const [stored, setStored] = useState(/** @type {string | null} */ (null));
  const [loaded, setLoaded] = useState(false);

  const refresh = useCallback(async () => {
    if (!userId) { setStored(null); setLoaded(false); return; }
    const { data } = await supabase.from('profiles').select('watchlist_visibility').eq('id', userId).maybeSingle();
    setStored(data?.watchlist_visibility ?? null);
    setLoaded(true);
  }, [userId]);

  // eslint-disable-next-line react-hooks/set-state-in-effect -- load the saved setting when the signed-in user changes
  useEffect(() => { refresh(); }, [refresh]);

  /** @param {WatchlistVisibility} value @returns {Promise<boolean>} */
  const setVisibility = useCallback(async (value) => {
    if (!userId) return false;
    const previous = stored;
    setStored(value);
    const { error } = await updateProfile({ userId, patch: { watchlist_visibility: value } });
    if (error) { setStored(previous); return false; }
    return true;
  }, [userId, stored]);

  return {
    visibility: effectiveWatchlistVisibility({ is_public: isPublic, watchlist_visibility: stored }),
    loaded,
    refresh,
    setVisibility,
  };
}

/**
 * @typedef {{ id: string, username: string | null, display_name: string | null, avatar_url: string | null,
 *   is_follower: boolean, is_partner: boolean, selected: boolean }} WatchlistViewerCandidate
 */

/**
 * Followers and Watch together partners the signed-in user can share their
 * watchlist with, and toggling each on the selected list.
 * @param {string | null | undefined} userId
 */
export function useWatchlistViewers(userId) {
  const [people, setPeople] = useState(/** @type {WatchlistViewerCandidate[]} */ ([]));
  const [loading, setLoading] = useState(false);

  const refresh = useCallback(async () => {
    if (!userId) { setPeople([]); return; }
    setLoading(true);
    const { data } = await supabase.rpc('list_watchlist_viewer_candidates');
    setPeople(data || []);
    setLoading(false);
  }, [userId]);

  // eslint-disable-next-line react-hooks/set-state-in-effect -- load the candidates when the signed-in user changes
  useEffect(() => { refresh(); }, [refresh]);

  /** @param {string} viewerId @param {boolean} on @returns {Promise<boolean>} */
  const setSelected = useCallback(async (viewerId, on) => {
    setPeople(p => p.map(x => x.id === viewerId ? { ...x, selected: on } : x));
    const { error } = await supabase.rpc('share_watchlist_with', { p_viewer: viewerId, p_on: on });
    if (error) {
      setPeople(p => p.map(x => x.id === viewerId ? { ...x, selected: !on } : x));
      reportActionFailure(FAILED_ACTIONS.WATCHLIST_SHARE, error);
      return false;
    }
    return true;
  }, []);

  return { people, loading, refresh, setSelected };
}
