import { useState, useEffect, useCallback } from 'react';
import { supabase } from './supabase.js';
import { splitWatchTogether, watchTogetherErrorCode } from './watchTogether.js';

/**
 * Watch together data hooks, shared by web and mobile. Every write goes
 * through a security definer RPC; the tables have no client write policies.
 * See supabase/migrations/20260925120000_watch_together.sql.
 */

/** @typedef {import('./watchTogether.js').WatchTogetherRow} WatchTogetherRow */
/** @typedef {import('./watchTogether.js').WatchTogetherTitle} WatchTogetherTitle */
/** @typedef {import('./watchTogether.js').PairState} PairState */

/**
 * @param {string} fn
 * @param {Record<string, unknown>} args
 * @returns {Promise<{ ok: true, data: any } | { ok: false, code: ReturnType<typeof watchTogetherErrorCode> }>}
 */
async function call(fn, args) {
  const { data, error } = await supabase.rpc(fn, args);
  if (error) return { ok: false, code: watchTogetherErrorCode(error) };
  return { ok: true, data };
}

/**
 * The signed-in person's partners and requests, with the actions that change them.
 *
 * @param {string | null | undefined} userId
 */
export function useWatchTogether(userId) {
  const [rows, setRows] = useState(/** @type {WatchTogetherRow[]} */ ([]));
  // Start in the loading state so screens that look someone up by username
  // don't flash "not partners" before the first load lands.
  const [loading, setLoading] = useState(!!userId);

  const refresh = useCallback(async () => {
    if (!userId) { setRows([]); return; }
    setLoading(true);
    const { data } = await supabase.rpc('list_watch_together');
    setRows(data || []);
    setLoading(false);
  }, [userId]);

  // eslint-disable-next-line react-hooks/set-state-in-effect -- load when the signed-in user changes
  useEffect(() => { refresh(); }, [refresh]);

  /** @param {string} otherId */
  const send = useCallback(async (otherId) => {
    const result = await call('send_watch_together_request', { p_recipient: otherId });
    if (result.ok) await refresh();
    return result;
  }, [refresh]);

  /** @param {string} otherId */
  const cancel = useCallback(async (otherId) => {
    const result = await call('cancel_watch_together_request', { p_recipient: otherId });
    if (result.ok) setRows(r => r.filter(x => x.other_id !== otherId));
    return result;
  }, []);

  /** @param {string} otherId @param {boolean} accept @param {boolean} [shareFull] */
  const respond = useCallback(async (otherId, accept, shareFull = false) => {
    const result = await call('respond_watch_together_request', { p_requester: otherId, p_accept: accept, p_share_full: shareFull });
    if (result.ok) await refresh();
    return result;
  }, [refresh]);

  /** @param {string} otherId */
  const end = useCallback(async (otherId) => {
    const result = await call('end_watch_together', { p_other: otherId });
    if (result.ok) setRows(r => r.filter(x => x.other_id !== otherId));
    return result;
  }, []);

  /** @param {string} otherId @param {boolean} share */
  const setShareFull = useCallback(async (otherId, share) => {
    const result = await call('set_watch_together_share_full', { p_other: otherId, p_share: share });
    if (result.ok) setRows(r => r.map(x => x.other_id === otherId ? { ...x, i_share_full: share } : x));
    return result;
  }, []);

  return { ...splitWatchTogether(rows), rows, loading, refresh, send, cancel, respond, end, setShareFull };
}

/**
 * Pair state and overlap count between the viewer and someone else, for the
 * tile on their profile.
 *
 * @param {string | null | undefined} otherId
 * @param {string | null | undefined} viewerId
 */
export function useWatchTogetherStatus(otherId, viewerId) {
  const [status, setStatus] = useState(/** @type {{ state: PairState, overlap_count: number | null } | null} */ (null));

  const refresh = useCallback(async () => {
    if (!otherId || !viewerId || otherId === viewerId) { setStatus(null); return; }
    const { data } = await supabase.rpc('watch_together_status', { p_other: otherId });
    const row = Array.isArray(data) ? data[0] : data;
    setStatus(row ? { state: row.state, overlap_count: row.overlap_count ?? null } : null);
  }, [otherId, viewerId]);

  // eslint-disable-next-line react-hooks/set-state-in-effect -- load when either person changes
  useEffect(() => { refresh(); }, [refresh]);

  return { status, refresh };
}

/**
 * Titles for Watch together with one or more partners.
 *
 * @param {string[]} otherIds
 */
export function useWatchTogetherTitles(otherIds) {
  const key = [...otherIds].sort().join(',');
  const [titles, setTitles] = useState(/** @type {WatchTogetherTitle[]} */ ([]));
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(/** @type {ReturnType<typeof watchTogetherErrorCode> | null} */ (null));

  const refresh = useCallback(async () => {
    const ids = key ? key.split(',') : [];
    if (!ids.length) { setTitles([]); return; }
    setLoading(true);
    const result = await call('watch_together_titles', { p_others: ids });
    setTitles(result.ok ? (result.data || []) : []);
    setError(result.ok ? null : result.code);
    setLoading(false);
  }, [key]);

  // eslint-disable-next-line react-hooks/set-state-in-effect -- load when the group changes
  useEffect(() => { refresh(); }, [refresh]);

  return { titles, loading, error, refresh };
}

/**
 * Up to five people to invite (see suggest_watch_together for the rules).
 *
 * @param {string | null | undefined} userId
 */
export function useWatchTogetherSuggestions(userId) {
  const [people, setPeople] = useState(/** @type {{ id: string, username: string, display_name: string | null, avatar_url: string | null }[]} */ ([]));

  const refresh = useCallback(async () => {
    if (!userId) { setPeople([]); return; }
    const { data } = await supabase.rpc('suggest_watch_together');
    setPeople(data || []);
  }, [userId]);

  // eslint-disable-next-line react-hooks/set-state-in-effect -- load when the signed-in user changes
  useEffect(() => { refresh(); }, [refresh]);

  return { people, refresh };
}
