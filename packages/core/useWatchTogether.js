import { useState, useEffect, useCallback, useRef } from 'react';
import { supabase } from './supabase.js';
import { getConfig } from './config.js';
import { reportActionFailure, FAILED_ACTIONS } from './actionFailures.js';
import { splitWatchTogether, watchTogetherErrorCode, sessionChannel, titleKey, trendingAsTitles, exampleTitlePool, DEMO_SIZE } from './watchTogether.js';
import { tmdb } from './tmdb.js';

/**
 * Watch together data hooks, shared by web and mobile. Every write goes
 * through a security definer RPC; the tables have no client write policies.
 * See supabase/migrations/20260927100000_watch_together.sql.
 */

/** @typedef {import('./watchTogether.js').WatchTogetherRow} WatchTogetherRow */
/** @typedef {import('./watchTogether.js').WatchTogetherTitle} WatchTogetherTitle */
/** @typedef {import('./watchTogether.js').PairState} PairState */

/**
 * @param {string} fn
 * @param {Record<string, unknown>} args
 * @returns {Promise<{ ok: true, data: any } | { ok: false, code: ReturnType<typeof watchTogetherErrorCode> }>}
 */
/**
 * Report a Watch together action to analytics. Best effort: a broken seam
 * never breaks the feature. Exported for the share button, which lives in the
 * apps.
 * @param {'invite_sent' | 'request_accepted' | 'link_shared' | 'link_accepted' | 'session_started' | 'match' | 'list_invite_shared' | 'list_joined'} action
 * @param {Record<string, unknown>} [props]
 */
export function reportWatchTogether(action, props = {}) {
  try { getConfig().onWatchTogether?.({ action, ...props }); } catch { /* analytics is best-effort */ }
}

async function call(fn, args, failAction = null) {
  const { data, error } = await supabase.rpc(fn, args);
  if (error) {
    const code = watchTogetherErrorCode(error);
    // premium_required and not_allowed are the server's rules answering, not
    // failures worth counting.
    if (failAction && code === 'generic') reportActionFailure(failAction, error);
    return { ok: false, code };
  }
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
    const result = await call('send_watch_together_request', { p_recipient: otherId }, FAILED_ACTIONS.WATCH_TOGETHER_INVITE);
    if (result.ok && result.data === 'pending') reportWatchTogether('invite_sent');
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
    const result = await call('respond_watch_together_request', { p_requester: otherId, p_accept: accept, p_share_full: shareFull }, FAILED_ACTIONS.WATCH_TOGETHER_RESPOND);
    if (result.ok && accept) reportWatchTogether('request_accepted', { share_full: !!shareFull });
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
 * overlap_count is only set when that person's watchlist is public.
 *
 * @param {string | null | undefined} userId
 */
export function useWatchTogetherSuggestions(userId) {
  const [people, setPeople] = useState(/** @type {import('./watchTogether.js').WatchTogetherSuggestion[]} */ ([]));
  const [loading, setLoading] = useState(!!userId);

  const refresh = useCallback(async () => {
    if (!userId) { setPeople([]); setLoading(false); return; }
    const { data } = await supabase.rpc('suggest_watch_together');
    setPeople(data || []);
    setLoading(false);
  }, [userId]);

  // eslint-disable-next-line react-hooks/set-state-in-effect -- load when the signed-in user changes
  useEffect(() => { refresh(); }, [refresh]);

  return { people, loading, refresh };
}

/**
 * The signed-in person's reusable invite link key, made on first use, and a
 * way to reset it (links shared before stop working).
 *
 * @param {string | null | undefined} userId
 */
export function useWatchTogetherLink(userId) {
  const [key, setKey] = useState(/** @type {string | null} */ (null));

  useEffect(() => {
    if (!userId) return undefined;
    let live = true;
    supabase.rpc('my_watch_together_link').then(({ data }) => { if (live) setKey(data || null); });
    return () => { live = false; };
  }, [userId]);

  const reset = useCallback(async () => {
    const result = await call('reset_watch_together_link', {});
    if (result.ok) setKey(result.data || null);
    return result;
  }, []);

  return { key: userId ? key : null, reset };
}

/**
 * Who an invite link belongs to. Works signed out.
 * @param {string} key
 * @returns {Promise<{ id: string, username: string, display_name: string | null, avatar_url: string | null } | null>}
 */
export async function watchTogetherLinkOwner(key) {
  const { data } = await supabase.rpc('watch_together_link_owner', { p_key: key });
  return (Array.isArray(data) ? data[0] : data) || null;
}

/**
 * The signed-in visitor's side of an invite link. state: 'self', 'none',
 * 'outgoing', 'incoming' or 'paired'; can_decide: either of you has Premium.
 * @param {string} key
 * @returns {Promise<{ id: string, username: string, display_name: string | null, avatar_url: string | null, state: string, can_decide: boolean } | null>}
 */
export async function watchTogetherLinkStatus(key) {
  const { data } = await supabase.rpc('watch_together_link_status', { p_key: key });
  return (Array.isArray(data) ? data[0] : data) || null;
}

/** Accept an invite link, pairing you with its owner. @param {string} key @param {boolean} [shareFull] */
export async function acceptWatchTogetherLink(key, shareFull = false) {
  const result = await call('accept_watch_together_link', { p_key: key, p_share_full: shareFull }, FAILED_ACTIONS.WATCH_TOGETHER_LINK_ACCEPT);
  if (result.ok) reportWatchTogether('link_accepted', { share_full: !!shareFull });
  return result;
}

/**
 * A live two-person session. Reads and votes go through RPCs; after each vote
 * the client pings the session's Realtime broadcast channel and both sides
 * re-read. The ping carries no data, so the channel needs no access rules. A
 * slow poll covers dropped connections.
 *
 * @param {string | null | undefined} sessionId
 * @param {{ pollMs?: number }} [options]
 */
export function useWatchTogetherSession(sessionId, { pollMs = 5000 } = {}) {
  const [session, setSession] = useState(/** @type {import('./watchTogether.js').SessionState | null} */ (null));
  const [error, setError] = useState(/** @type {ReturnType<typeof watchTogetherErrorCode> | null} */ (null));
  const [loading, setLoading] = useState(!!sessionId);
  const channelRef = useRef(/** @type {any} */ (null));

  const refresh = useCallback(async () => {
    if (!sessionId) return;
    const result = await call('get_watch_together_session', { p_session: sessionId });
    if (result.ok) { setSession(result.data); setError(null); } else setError(result.code);
    setLoading(false);
  }, [sessionId]);

  useEffect(() => {
    if (!sessionId) return undefined;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- first read of the session
    refresh();
    const channel = supabase.channel(sessionChannel(sessionId), { config: { broadcast: { self: false } } })
      .on('broadcast', { event: 'update' }, () => { refresh(); })
      .subscribe();
    channelRef.current = channel;
    const timer = setInterval(refresh, pollMs);
    return () => {
      clearInterval(timer);
      channelRef.current = null;
      supabase.removeChannel(channel);
    };
  }, [sessionId, refresh, pollMs]);

  const ping = useCallback(() => {
    channelRef.current?.send({ type: 'broadcast', event: 'update', payload: {} });
  }, []);

  /** @param {{ tmdb_id: number, media_type: string }} card @param {boolean} yes */
  const vote = useCallback(async (card, yes) => {
    if (!sessionId) return { ok: false, matched: false };
    // Optimistic: record the answer so the next card shows straight away.
    setSession(s => s && { ...s, my_votes: [...s.my_votes.filter(v => titleKey(v) !== titleKey(card)), { tmdb_id: card.tmdb_id, media_type: card.media_type, yes }] });
    const result = await call('vote_watch_together', { p_session: sessionId, p_tmdb_id: card.tmdb_id, p_media_type: card.media_type, p_yes: yes }, FAILED_ACTIONS.WATCH_TOGETHER_VOTE);
    if (result.ok && result.data) reportWatchTogether('match');
    ping();
    await refresh();
    return result.ok ? { ok: true, matched: !!result.data } : { ok: false, matched: false };
  }, [sessionId, ping, refresh]);

  const end = useCallback(async () => {
    if (!sessionId) return;
    await call('end_watch_together_session', { p_session: sessionId });
    ping();
    await refresh();
  }, [sessionId, ping, refresh]);

  return { session, error, loading, refresh, vote, end };
}

/** Start a session with a partner; resolves to the new session id or an error code. @param {string} otherId */
export async function startWatchTogetherSession(otherId) {
  const result = await call('start_watch_together_session', { p_other: otherId }, FAILED_ACTIONS.WATCH_TOGETHER_SESSION_START);
  if (result.ok) reportWatchTogether('session_started');
  return result;
}

/** The live session with a partner, if any. @param {string} otherId */
export async function liveWatchTogetherSession(otherId) {
  return call('live_watch_together_session', { p_other: otherId });
}

/**
 * Real titles for the start page's example and demo: your saved titles with
 * posters, topped up from this week's trending when you have too few, so the
 * example is never blank. Never guesses TMDB ids.
 *
 * @param {{ tmdb_id: number, media_type: string, poster_path?: string | null }[] | null | undefined} saved
 */
export function useWatchTogetherExampleTitles(saved) {
  const [trending, setTrending] = useState(/** @type {import('./watchTogether.js').SessionCard[]} */ ([]));
  const own = exampleTitlePool(saved, []);
  const needMore = own.length < DEMO_SIZE * 2;
  useEffect(() => {
    if (!needMore) return undefined;
    let live = true;
    tmdb.getTrending('all', 'week').then(r => { if (live) setTrending(trendingAsTitles(r?.results)); }, () => {});
    return () => { live = false; };
  }, [needMore]);
  return exampleTitlePool(saved, trending);
}
