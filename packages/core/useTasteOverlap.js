import { useState, useEffect, useCallback } from 'react';
import { supabase } from './supabase.js';
import { tasteOverlap } from './tasteOverlap.js';

/**
 * @typedef {'premium_required' | 'not_found' | 'not_visible' | 'not_authenticated' | 'failed'} TasteOverlapError
 */

/** The RPC raises its reason as the message; anything else is a plain failure. */
const KNOWN_ERRORS = new Set(['premium_required', 'not_found', 'not_visible', 'not_authenticated']);

/**
 * The last answer per viewer and handle, for this tab only. Going back to a
 * comparison shows it at once and refreshes underneath, instead of a second
 * wait for a round trip to the production region. Memory only, never storage:
 * it holds another person's history, and it must not outlive the session.
 * @type {Map<string, { target: any, overlap: any, sharedWatchlist: number | null }>}
 */
const lastResult = new Map();
const MAX_CACHED = 20;

const cacheKey = (viewerId, handle) => (viewerId && handle ? `${viewerId}:${handle.toLowerCase()}` : null);

/**
 * Taste overlap between the signed-in viewer and `username`.
 *
 * The `taste_overlap` RPC is the gate: it refuses non-Premium viewers, blocked
 * or missing handles, and private profiles the viewer does not follow. Pass
 * `enabled: false` to skip the call (a Free viewer the client already knows
 * will be refused). Pass `viewerId` to reuse the last answer for this viewer
 * while a fresh one loads.
 *
 * `sharedWatchlist` is the count of titles on both watchlists. The RPC
 * returns it for anyone whose profile you can read (can_view_profile), which
 * since unified profile visibility includes accepted followers of private
 * profiles.
 *
 * @param {string | null | undefined} username
 * @param {{ enabled?: boolean, viewerId?: string | null }} [opts]
 */
export function useTasteOverlap(username, { enabled = true, viewerId = null } = {}) {
  const handle = (username || '').replace(/^@/, '').trim();
  const key = cacheKey(viewerId, handle);
  const cached = enabled && key ? lastResult.get(key) : undefined;
  const [loading, setLoading] = useState(enabled && !!handle && !cached);
  /** @type {[TasteOverlapError | null, Function]} */
  const [error, setError] = useState(null);
  const [target, setTarget] = useState(cached?.target ?? null);
  const [overlap, setOverlap] = useState(cached?.overlap ?? null);
  const [sharedWatchlist, setSharedWatchlist] = useState(cached?.sharedWatchlist ?? null);

  const load = useCallback(async () => {
    if (!enabled || !handle) { setLoading(false); return; }
    const hit = key ? lastResult.get(key) : undefined;
    setError(null);
    if (hit) {
      setTarget(hit.target); setOverlap(hit.overlap); setSharedWatchlist(hit.sharedWatchlist);
      setLoading(false);
    } else {
      setLoading(true);
    }
    const { data, error: rpcError } = await supabase.rpc('taste_overlap', { p_username: handle });
    if (rpcError || !data) {
      const reason = rpcError?.message;
      // A refusal (blocked, gone private, Premium lapsed) replaces a cached
      // answer; a plain network failure keeps showing it.
      if (key && KNOWN_ERRORS.has(reason)) lastResult.delete(key);
      if (!hit || KNOWN_ERRORS.has(reason)) {
        setError(KNOWN_ERRORS.has(reason) ? reason : 'failed');
        setTarget(null); setOverlap(null); setSharedWatchlist(null);
      }
    } else {
      const next = {
        target: data.target,
        overlap: tasteOverlap(data.mine || [], data.theirs || []),
        sharedWatchlist: typeof data.shared_watchlist === 'number' ? data.shared_watchlist : null,
      };
      if (key) {
        lastResult.delete(key);
        lastResult.set(key, next);
        if (lastResult.size > MAX_CACHED) lastResult.delete(lastResult.keys().next().value);
      }
      setTarget(next.target); setOverlap(next.overlap); setSharedWatchlist(next.sharedWatchlist);
    }
    setLoading(false);
  }, [handle, key, enabled]);

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
