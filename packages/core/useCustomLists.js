import { readListItems } from './listReads.js';
import { on, LISTS_CHANGED_EVENT } from './events.js';
import { useState, useEffect, useCallback } from 'react';
import { supabase } from './supabase.js';
import { genreIdsFromItem, mediaIdentityRow, tmdbIdFromItem } from './media.js';
import { getConfig } from './config.js';
import { createCustomListRecord, CUSTOM_LIST_LIMIT_CODE } from './customListCreation.js';
import { LIST_VISIBILITIES, listVisibility } from './customLists.js';

/**
 * User-created custom lists, plus (with includeShared) the shared lists the
 * user is a member of. Shared lists come from Watch together
 * (supabase/migrations/20260925140000_watch_together_shared_lists.sql): each
 * list gains `role` ('owner' | 'member') and `people` (owner and members),
 * and members edit through RPCs because items stay owned by the list owner.
 *
 * @param {string|null|undefined} userId
 * @param {{ includeShared?: boolean }} [options]  Off until the shared lists
 *   migration is live; the web app passes its launch flag.
 * @returns {{
 *   lists: any[];
 *   ownedCount: number;
 *   loading: boolean;
 *   createList: (name: string) => Promise<any>;
 *   deleteList: (listId: string) => Promise<any>;
 *   renameList: (listId: string, name: string) => Promise<any>;
 *   setListVisibility: (listId: string, visibility: import('./customLists.js').ListVisibility) => Promise<any>;
 *   addItem: (listId: string, item: any) => Promise<any>;
 *   removeItem: (listId: string, tmdbId: number) => Promise<any>;
 *   isInList: (listId: string, tmdbId: number) => boolean;
 *   createSharedList: (name: string, memberIds: string[], seedPartnerId?: string | null) => Promise<string | null>;
 *   addMember: (listId: string, memberId: string) => Promise<boolean>;
 *   leaveList: (listId: string) => Promise<boolean>;
 *   refresh: () => Promise<void>;
 * }}
 */
export function useCustomLists(userId, { includeShared = false } = {}) {
  const [lists,   setLists]   = useState([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    if (!userId) { setLoading(false); return; }
    try {
      const data = [];
      for (let offset = 0; ; offset += 1000) {
        const { data: page, error } = await supabase.from('user_custom_lists').select('*')
          .eq('user_id',userId).order('id').range(offset,offset + 999);
        if (error) throw error;
        for (const list of page || []) data.push({ ...list, items: await readListItems({ userId, listId: list.id, custom: true }) });
        if (!page || page.length < 1000) break;
      }
      data.sort((a,b) => String(a.created_at || '').localeCompare(String(b.created_at || '')));
      // Your own lists are tagged as owned; shared lists you're a member of
      // (Watch together) are added when the caller asks for them.
      let all = data.map(l => ({ ...l, role: 'owner', people: [] }));
      if (includeShared) all = await withSharedLists(userId, all);
      setLists(all);
    } catch { /* Retain the last complete collection on a failed page. */ }
    setLoading(false);
  }, [userId, includeShared]);

  // eslint-disable-next-line react-hooks/set-state-in-effect -- loading is delegated to the stable loader callback
  useEffect(() => { load(); }, [load]);
  useEffect(() => on(LISTS_CHANGED_EVENT, load), [load]);

  const createList = useCallback(async (name) => {
    if (!userId || !name?.trim()) return null;
    let data;
    try {
      data = await createCustomListRecord(supabase, userId, name);
    } catch (error) {
      if (error.code === CUSTOM_LIST_LIMIT_CODE) throw error;
      console.error('Failed to create custom list', error);
      return null;
    }
    if (data) {
      setLists(prev => [...prev, { ...data, items: [] }]);
      getConfig().onCustomListChange?.({ list_id: data.id, action: 'created' });
    }
    return data;
  }, [userId]);

  const deleteList = useCallback(async (listId) => {
    if (!userId) return false;
    const { error } = await supabase.from('user_custom_lists')
      .delete()
      .eq('id', listId)
      .eq('user_id', userId);
    if (error) {
      console.error('Failed to delete custom list', error);
      return false;
    }
    setLists(prev => prev.filter(l => l.id !== listId));
    getConfig().onCustomListChange?.({ list_id: listId, action: 'deleted' });
    return true;
  }, [userId]);

  const isShared = useCallback((listId) => {
    const list = lists.find(l => l.id === listId);
    return !!list && (list.role === 'member' || list.people?.length > 0);
  }, [lists]);

  const renameList = useCallback(async (listId, name) => {
    if (!userId || !name?.trim()) return null;
    if (isShared(listId)) {
      const { error } = await supabase.rpc('rename_shared_list', { p_list: listId, p_name: name.trim() });
      if (error) { console.error('Failed to rename shared list', error); return null; }
      setLists(prev => prev.map(l => l.id === listId ? { ...l, name: name.trim() } : l));
      return { id: listId, name: name.trim() };
    }
    const { data, error } = await supabase
      .from('user_custom_lists')
      .update({ name: name.trim() })
      .eq('id', listId)
      .eq('user_id', userId)
      .select()
      .single();
    if (error) {
      console.error('Failed to rename custom list', error);
      return null;
    }
    if (data) setLists(prev => prev.map(l => l.id === listId ? { ...l, name: data.name } : l));
    return data;
  }, [userId, isShared]);

  /** @param {string} listId @param {import('./customLists.js').ListVisibility} visibility */
  const setListVisibility = useCallback(async (listId, visibility) => {
    if (!userId || !LIST_VISIBILITIES.includes(visibility)) return null;
    const { data, error } = await supabase
      .from('user_custom_lists')
      .update({ visibility })
      .eq('id', listId)
      .eq('user_id', userId)
      .select()
      .single();
    if (error) {
      console.error('Failed to update custom list visibility', error);
      return null;
    }
    if (data) {
      // The DB trigger keeps is_public in step; take both back from the row.
      setLists(prev => prev.map(l => l.id === listId ? { ...l, visibility: data.visibility, is_public: data.is_public } : l));
      getConfig().onCustomListVisibility?.({ list_id: listId, visibility: listVisibility(data), is_public: !!data.is_public });
    }
    return data;
  }, [userId]);

  const addItem = useCallback(async (listId, item) => {
    if (!userId) return null;
    const tmdbId = tmdbIdFromItem(item);
    if (!tmdbId) return null;
    const row = mediaIdentityRow(item);
    if (!row) return null;

    if (isShared(listId)) {
      const { error } = await supabase.rpc('add_shared_list_item', {
        p_list: listId, p_tmdb_id: tmdbId, p_media_type: row.media_type, p_title: row.title,
        p_poster_path: row.poster_path ?? null, p_genre_ids: genreIdsFromItem(item),
      });
      if (error) { console.error('Failed to add shared list item', error); return null; }
      // The RPC doesn't return the row; a stable local id keeps list keys unique until the next load.
      const added = { ...row, id: `added-${listId}-${tmdbId}`, list_id: listId, genre_ids: genreIdsFromItem(item), added_by: userId, added_at: new Date().toISOString() };
      setLists(prev => prev.map(l => l.id === listId ? { ...l, items: [added, ...(l.items || []).filter(i => i.tmdb_id !== tmdbId)] } : l));
      getConfig().onCustomListItemChange?.({ list_id: listId, tmdb_id: tmdbId, media_type: row.media_type, action: 'added' });
      return added;
    }

    const { data, error } = await supabase
      .from('user_custom_list_items')
      .upsert({
        list_id:     listId,
        user_id:     userId,
        ...row,
        genre_ids:   genreIdsFromItem(item),
      }, { onConflict: 'list_id,tmdb_id' })
      .select()
      .single();
    if (error) {
      console.error('Failed to add custom list item', error);
      return null;
    }
    if (data) {
      setLists(prev => prev.map(l =>
        l.id === listId
          ? { ...l, items: [data, ...(l.items || []).filter(i => i.tmdb_id !== tmdbId)] }
          : l
      ));
      getConfig().onCustomListItemChange?.({
        list_id: listId, tmdb_id: tmdbId, media_type: row.media_type, action: 'added',
      });
    }
    return data ?? null;
  }, [userId, isShared]);

  const removeItem = useCallback(async (listId, tmdbId) => {
    if (!userId) return false;
    const { error } = isShared(listId)
      ? await supabase.rpc('remove_shared_list_item', { p_list: listId, p_tmdb_id: Number(tmdbId) })
      : await supabase.from('user_custom_list_items')
      .delete()
      .eq('list_id', listId)
      .eq('user_id', userId)
      .eq('tmdb_id', Number(tmdbId));
    if (error) {
      console.error('Failed to remove custom list item', error);
      return false;
    }
    const removed = lists.find(l => l.id === listId)?.items?.find(i => i.tmdb_id === Number(tmdbId));
    setLists(prev => prev.map(l =>
      l.id === listId
        ? { ...l, items: (l.items || []).filter(i => i.tmdb_id !== Number(tmdbId)) }
        : l
    ));
    getConfig().onCustomListItemChange?.({
      list_id: listId, tmdb_id: Number(tmdbId), media_type: removed?.media_type, action: 'removed',
    });
    return true;
  }, [userId, lists, isShared]);

  const isInList = useCallback((listId, tmdbId) => {
    const list = lists.find(l => l.id === listId);
    return list?.items?.some(i => i.tmdb_id === Number(tmdbId)) ?? false;
  }, [lists]);

  const createSharedList = useCallback(async (name, memberIds, seedPartnerId = null) => {
    if (!userId || !name?.trim() || !memberIds?.length) return null;
    const { data, error } = await supabase.rpc('create_shared_list', { p_name: name.trim(), p_members: memberIds, p_seed_partner: seedPartnerId });
    if (error) { console.error('Failed to create shared list', error); return null; }
    await load();
    getConfig().onCustomListChange?.({ list_id: data, action: 'created' });
    return data;
  }, [userId, load]);

  const addMember = useCallback(async (listId, memberId) => {
    const { error } = await supabase.rpc('add_shared_list_member', { p_list: listId, p_user: memberId });
    if (error) { console.error('Failed to add list member', error); return false; }
    await load();
    return true;
  }, [load]);

  const leaveList = useCallback(async (listId) => {
    const { error } = await supabase.rpc('leave_shared_list', { p_list: listId });
    if (error) { console.error('Failed to leave shared list', error); return false; }
    setLists(prev => prev.filter(l => l.id !== listId));
    return true;
  }, []);

  const ownedCount = lists.filter(l => l.role !== 'member').length;

  return { lists, ownedCount, loading, createList, deleteList, renameList, setListVisibility, addItem, removeItem, isInList, createSharedList, addMember, leaveList, refresh: load };
}

/**
 * Add the lists the user is a member of, and everyone on each shared list.
 * Errors are ignored so lists still load if the shared lists migration isn't
 * live yet.
 *
 * @param {string} userId
 * @param {any[]} owned
 */
async function withSharedLists(userId, owned) {
  const { data: memberships, error } = await supabase
    .from('user_custom_list_members').select('list_id').eq('user_id', userId);
  if (error) return owned;
  const memberIds = (memberships || []).map(m => m.list_id);
  let memberLists = [];
  if (memberIds.length) {
    const { data } = await supabase
      .from('user_custom_lists')
      .select('*, items:user_custom_list_items(*)')
      .in('id', memberIds)
      .order('created_at', { ascending: true });
    memberLists = (data || []).map(l => ({ ...l, role: 'member', people: [] }));
  }
  const all = [...owned, ...memberLists];
  if (!all.length) return all;
  const { data: people } = await supabase.rpc('list_shared_list_people', { p_lists: all.map(l => l.id) });
  const byList = new Map();
  for (const p of people || []) byList.set(p.list_id, [...(byList.get(p.list_id) || []), p]);
  return all.map(l => ({ ...l, people: byList.get(l.id) || [] }));
}
