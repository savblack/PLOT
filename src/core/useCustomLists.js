import { useState, useEffect, useCallback } from 'react';
import { supabase } from './supabase.js';
import { mediaIdentityRow, tmdbIdFromItem } from './media.js';

export function useCustomLists(userId) {
  const [lists,   setLists]   = useState([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    if (!userId) { setLoading(false); return; }
    const { data } = await supabase
      .from('user_custom_lists')
      .select('*, items:user_custom_list_items(*)')
      .eq('user_id', userId)
      .order('created_at', { ascending: true });
    setLists(data || []);
    setLoading(false);
  }, [userId]);

  // eslint-disable-next-line react-hooks/set-state-in-effect -- loading is delegated to the stable loader callback
  useEffect(() => { load(); }, [load]);

  const createList = useCallback(async (name) => {
    if (!userId || !name?.trim()) return null;
    const { data, error } = await supabase
      .from('user_custom_lists')
      .insert({ user_id: userId, name: name.trim() })
      .select()
      .single();
    if (error) {
      console.error('Failed to create custom list', error);
      return null;
    }
    if (data) setLists(prev => [...prev, { ...data, items: [] }]);
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
    return true;
  }, [userId]);

  const renameList = useCallback(async (listId, name) => {
    if (!userId || !name?.trim()) return null;
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
  }, [userId]);

  const addItem = useCallback(async (listId, item) => {
    if (!userId) return null;
    const tmdbId = tmdbIdFromItem(item);
    if (!tmdbId) return null;
    const row = mediaIdentityRow(item);
    if (!row) return null;

    const { data, error } = await supabase
      .from('user_custom_list_items')
      .upsert({
        list_id:     listId,
        user_id:     userId,
        ...row,
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
    }
    return data ?? null;
  }, [userId]);

  const removeItem = useCallback(async (listId, tmdbId) => {
    if (!userId) return false;
    const { error } = await supabase.from('user_custom_list_items')
      .delete()
      .eq('list_id', listId)
      .eq('user_id', userId)
      .eq('tmdb_id', Number(tmdbId));
    if (error) {
      console.error('Failed to remove custom list item', error);
      return false;
    }
    setLists(prev => prev.map(l =>
      l.id === listId
        ? { ...l, items: (l.items || []).filter(i => i.tmdb_id !== Number(tmdbId)) }
        : l
    ));
    return true;
  }, [userId]);

  const isInList = useCallback((listId, tmdbId) => {
    const list = lists.find(l => l.id === listId);
    return list?.items?.some(i => i.tmdb_id === Number(tmdbId)) ?? false;
  }, [lists]);

  return { lists, loading, createList, deleteList, renameList, addItem, removeItem, isInList };
}
