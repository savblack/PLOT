import { useState, useEffect, useCallback } from 'react';
import { supabase } from './supabase.js';
import { getConfig } from './config.js';
import { reportActionFailure, FAILED_ACTIONS } from './actionFailures.js';

/**
 * Follow `targetId` (or request to, for a private profile) and read back the
 * status the DB trigger assigned. The one place a follow is written: the
 * profile header (useFollows below) and the list-row FollowButton on both apps
 * both land here, so user_followed and action_failed each fire exactly once.
 *
 * @param {{ viewerId: string, targetId: string }} args
 * @returns {Promise<{ ok: boolean, status: string|null }>}
 */
export async function followUser({ viewerId, targetId }) {
  const { error } = await supabase.from('follows').insert({ follower_id: viewerId, following_id: targetId });
  if (error) {
    reportActionFailure(FAILED_ACTIONS.FOLLOW, error);
    return { ok: false, status: null };
  }
  const status = await readFollowStatus(viewerId, targetId);
  getConfig().onFollow?.({ target_user_id: targetId, following: true });
  return { ok: true, status };
}

/**
 * Unfollow, or cancel a pending request.
 * @param {{ viewerId: string, targetId: string }} args
 * @returns {Promise<boolean>}
 */
export async function unfollowUser({ viewerId, targetId }) {
  const { error } = await supabase.from('follows').delete()
    .eq('follower_id', viewerId).eq('following_id', targetId);
  if (error) {
    reportActionFailure(FAILED_ACTIONS.UNFOLLOW, error);
    return false;
  }
  getConfig().onFollow?.({ target_user_id: targetId, following: false });
  return true;
}

async function readFollowStatus(viewerId, targetId) {
  const { data } = await supabase.from('follows')
    .select('status').eq('follower_id', viewerId).eq('following_id', targetId).maybeSingle();
  return data?.status ?? null;
}

/**
 * Follow relationship between the signed-in viewer and `targetId`.
 *
 * `status` is the viewer's relationship to the target: 'accepted' (following),
 * 'pending' (requested a private profile), or null (not following). Following a
 * public profile is instant; a private profile creates a pending request (the
 * status the DB trigger assigns is read back after insert). Counts reflect
 * accepted follows only.
 */
export function useFollows(targetId, viewerId, initialStatus = null) {
  const [followers, setFollowers] = useState(0);
  const [following, setFollowing] = useState(0);
  const [status, setStatus]       = useState(initialStatus);
  const [busy, setBusy]           = useState(false);

  // eslint-disable-next-line react-hooks/set-state-in-effect -- mirror the controlled initial status into local interaction state
  useEffect(() => { setStatus(initialStatus); }, [initialStatus]);

  const readStatus = useCallback(async () => {
    if (!viewerId || viewerId === targetId) return null;
    return readFollowStatus(viewerId, targetId);
  }, [viewerId, targetId]);

  const refresh = useCallback(async () => {
    if (!targetId) return;
    const { data: rows } = await supabase.rpc('get_follow_counts', { p_target: targetId });
    const counts = Array.isArray(rows) ? rows[0] : rows;
    setFollowers(Number(counts?.followers) || 0);
    setFollowing(Number(counts?.following) || 0);
    setStatus(await readStatus());
  }, [targetId, readStatus]);

  // eslint-disable-next-line react-hooks/set-state-in-effect -- load relationship counts when the target changes
  useEffect(() => { refresh(); }, [refresh]);

  // Follow (public → accepted) or request (private → pending). The DB trigger
  // decides; followUser reads the resulting status back.
  const follow = useCallback(async () => {
    if (!viewerId || viewerId === targetId || busy || status) return;
    setBusy(true);
    const result = await followUser({ viewerId, targetId });
    if (result.ok) {
      setStatus(result.status);
      if (result.status === 'accepted') setFollowers(c => c + 1);
    }
    setBusy(false);
  }, [viewerId, targetId, busy, status]);

  // Unfollow or cancel a pending request.
  const unfollow = useCallback(async () => {
    if (!viewerId || busy || !status) return;
    setBusy(true);
    const wasAccepted = status === 'accepted';
    if (await unfollowUser({ viewerId, targetId })) {
      setStatus(null);
      if (wasAccepted) setFollowers(c => Math.max(0, c - 1));
    }
    setBusy(false);
  }, [viewerId, targetId, busy, status]);

  return {
    followers, following, status, busy, follow, unfollow,
    canFollow: !!viewerId && viewerId !== targetId,
    // Exposed so a caller can re-read after something else changed the
    // relationship behind its back. Blocking is the case that needs it: the
    // user_blocks insert trigger deletes follows in both directions
    // server-side, so without a refresh the profile keeps rendering
    // "Following" for an account the viewer has just blocked.
    refresh,
  };
}
