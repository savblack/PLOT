import { useState, useEffect, useCallback } from 'react';
import { supabase } from './supabase.js';
import { reportActionFailure, FAILED_ACTIONS } from './actionFailures.js';
import { watchTogetherErrorCode } from './watchTogether.js';
import { reportWatchTogether } from './useWatchTogether.js';

/**
 * Collaborative list invites, shared by web and mobile. Every read and write
 * goes through a security definer RPC; the invites table has no client
 * policies. Rules: listInvites.js and
 * supabase/migrations/20261001140000_collaborative_list_invites.sql.
 */

/** @typedef {import('./listInvites.js').ListInvitePreview} ListInvitePreview */
/** @typedef {ReturnType<typeof watchTogetherErrorCode>} ListInviteErrorCode */

/**
 * The invite key for a list you own. Only asked for when `enabled` (the owner
 * has Premium); the server raises premium_required otherwise.
 *
 * @param {string | null | undefined} listId
 * @param {{ enabled?: boolean }} [options]
 */
export function useListInvite(listId, { enabled = true } = {}) {
  const [key, setKey] = useState(/** @type {string | null} */ (null));
  const [code, setCode] = useState(/** @type {ListInviteErrorCode | null} */ (null));

  useEffect(() => {
    if (!listId || !enabled) return undefined;
    let live = true;
    supabase.rpc('my_list_invite', { p_list: listId }).then(({ data, error }) => {
      if (!live) return;
      if (error) { setCode(watchTogetherErrorCode(error)); setKey(null); return; }
      setCode(null);
      setKey(data || null);
    });
    return () => { live = false; };
  }, [listId, enabled]);

  const reset = useCallback(async () => {
    if (!listId) return { ok: false, code: 'not_allowed' };
    const { data, error } = await supabase.rpc('reset_list_invite', { p_list: listId });
    if (error) return { ok: false, code: watchTogetherErrorCode(error) };
    setKey(data || null);
    return { ok: true };
  }, [listId]);

  return { key: listId && enabled ? key : null, code, reset };
}

/**
 * Whether a list's owner has Premium, for a list you're on. null while
 * loading. Members use it to know whether "Add people" will work.
 *
 * @param {string | null | undefined} listId
 * @param {{ enabled?: boolean }} [options]
 * @returns {boolean | null}
 */
export function useListHostPremium(listId, { enabled = true } = {}) {
  const [premium, setPremium] = useState(/** @type {boolean | null} */ (null));
  useEffect(() => {
    if (!listId || !enabled) return undefined;
    let live = true;
    supabase.rpc('list_host_is_premium', { p_list: listId }).then(({ data, error }) => {
      if (live) setPremium(error ? false : data === true);
    });
    return () => { live = false; };
  }, [listId, enabled]);
  return premium;
}

/**
 * What an invite link points at. Works signed out.
 * @param {string} key
 * @returns {Promise<ListInvitePreview | null>}
 */
export async function listInvitePreview(key) {
  const { data } = await supabase.rpc('list_invite_preview', { p_key: key });
  return (Array.isArray(data) ? data[0] : data) || null;
}

/**
 * @typedef {object} ListInvitePeek  list_invite_peek() for one key: who else
 *   is on the list and a few of its posters, for the list-led landing.
 * @property {number} member_count  members besides the owner
 * @property {{ display_name: string | null, avatar_url: string | null }[]} members  at most three
 * @property {string[]} posters  poster paths, newest first, at most five
 */

/**
 * Who else is on a list behind an invite link, and a peek at its posters.
 * Works signed out. Null when the key is unknown or the read fails, and the
 * landing then falls back to the person-led layout.
 * @param {string} key
 * @returns {Promise<ListInvitePeek | null>}
 */
export async function listInvitePeek(key) {
  const { data, error } = await supabase.rpc('list_invite_peek', { p_key: key });
  if (error) return null;
  const row = (Array.isArray(data) ? data[0] : data) || null;
  if (!row) return null;
  return { member_count: row.member_count ?? 0, members: row.members || [], posters: row.posters || [] };
}

/**
 * Join a list from its invite link. Free accounts can join; the owner needs
 * Premium.
 * @param {string} key
 * @returns {Promise<{ ok: true, listId: string } | { ok: false, code: ListInviteErrorCode }>}
 */
export async function acceptListInvite(key) {
  const { data, error } = await supabase.rpc('accept_list_invite', { p_key: key });
  if (error) {
    const code = watchTogetherErrorCode(error);
    // premium_required and not_allowed are the server's rules answering.
    if (code === 'generic') reportActionFailure(FAILED_ACTIONS.LIST_INVITE_ACCEPT, error);
    return { ok: false, code };
  }
  reportWatchTogether('list_joined');
  return { ok: true, listId: data };
}

/**
 * Report that a list invite link was shared or copied. Called by the apps'
 * share buttons.
 * @param {string} method  'share' or 'copy'
 */
export function reportListInviteShared(method) {
  reportWatchTogether('list_invite_shared', { method });
}
