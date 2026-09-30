import { useState, useEffect, useCallback } from 'react';
import { supabase } from './supabase.js';
import { tasteOverlap } from './tasteOverlap.js';

/**
 * @typedef {'premium_required' | 'not_found' | 'not_visible' | 'not_authenticated' | 'failed'} TasteOverlapError
 */

/** The RPC raises its reason as the message; anything else is a plain failure. */
const KNOWN_ERRORS = new Set(['premium_required', 'not_found', 'not_visible', 'not_authenticated']);

/**
 * Taste overlap between the signed-in viewer and `username`.
 *
 * The `taste_overlap` RPC is the gate: it refuses non-Premium viewers, blocked
 * or missing handles, and private profiles the viewer does not follow. Pass
 * `enabled: false` to skip the call (a Free viewer the client already knows
 * will be refused).
 *
 * `sharedWatchlist` is the count of titles on both watchlists. The RPC
 * returns it for anyone whose profile you can read (can_view_profile), which
 * since unified profile visibility includes accepted followers of private
 * profiles.
 *
 * @param {string | null | undefined} username
 * @param {{ enabled?: boolean }} [opts]
 */
export function useTasteOverlap(username, { enabled = true } = {}) {
  const [loading, setLoading] = useState(enabled && !!username);
  /** @type {[TasteOverlapError | null, Function]} */
  const [error, setError] = useState(null);
  const [target, setTarget] = useState(null);
  const [overlap, setOverlap] = useState(null);
  const [sharedWatchlist, setSharedWatchlist] = useState(null);

  const load = useCallback(async () => {
    const handle = (username || '').replace(/^@/, '').trim();
    if (!enabled || !handle) { setLoading(false); return; }
    setLoading(true);
    setError(null);
    const { data, error: rpcError } = await supabase.rpc('taste_overlap', { p_username: handle });
    if (rpcError || !data) {
      const reason = rpcError?.message;
      setError(KNOWN_ERRORS.has(reason) ? reason : 'failed');
      setTarget(null); setOverlap(null); setSharedWatchlist(null);
    } else {
      setTarget(data.target);
      setOverlap(tasteOverlap(data.mine || [], data.theirs || []));
      setSharedWatchlist(typeof data.shared_watchlist === 'number' ? data.shared_watchlist : null);
    }
    setLoading(false);
  }, [username, enabled]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- load when the handle or gate changes
    load().catch(() => { setError('failed'); setLoading(false); });
  }, [load]);

  return { loading, error, target, overlap, sharedWatchlist, retry: load };
}

const SEARCH_DEBOUNCE_MS = 250;

/**
 * People to compare with: everyone the viewer follows (accepted, so all
 * comparable), plus search results once `query` has two or more characters.
 * Search rows carry `follow_status`, so a private profile with a pending
 * request can show "Request pending" (see canCompare in tasteOverlap.js).
 * Both RPCs already drop blocked accounts.
 *
 * @param {string | null | undefined} viewerId
 * @param {string} query
 */
export function useCompareCandidates(viewerId, query) {
  const [following, setFollowing] = useState([]);
  const [results, setResults] = useState([]);
  const [loadingFollowing, setLoadingFollowing] = useState(!!viewerId);
  const [searching, setSearching] = useState(false);

  useEffect(() => {
    if (!viewerId) return undefined;
    let alive = true;
    supabase.rpc('list_following', { p_target: viewerId }).then(({ data }) => {
      if (!alive) return;
      setFollowing((data || []).filter(p => p.id !== viewerId));
      setLoadingFollowing(false);
    }, () => { if (alive) setLoadingFollowing(false); });
    return () => { alive = false; };
  }, [viewerId]);

  const term = (query || '').replace(/^@/, '').trim();
  useEffect(() => {
    if (term.length < 2) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- clear stale results when the query is too short
      setResults([]); setSearching(false);
      return undefined;
    }
    let alive = true;
    setSearching(true);
    const timer = setTimeout(async () => {
      const { data } = await supabase.rpc('search_users', { p_query: term });
      if (!alive) return;
      setResults((data || []).filter(p => p.id !== viewerId));
      setSearching(false);
    }, SEARCH_DEBOUNCE_MS);
    return () => { alive = false; clearTimeout(timer); };
  }, [term, viewerId]);

  return { following, results, loadingFollowing, searching, isSearching: term.length >= 2 };
}
