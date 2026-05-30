import { useState, useEffect, useCallback } from 'react';
import { supabase } from '../api/supabase.js';
import { mediaIdentityRow, tmdbIdFromItem } from '../domain/media.js';

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

  useEffect(() => { load(); }, [load]);

  const createList = useCallback(async (name) => {
    if (!userId || !name?.trim()) return null;
    const { data } = await supabase
      .from('user_custom_lists')
      .insert({ user_id: userId, name: name.trim() })
      .select()
      .single();
    if (data) setLists(prev => [...prev, { ...data, items: [] }]);
    return data;
  }, [userId]);

  const deleteList = useCallback(async (listId) => {
    if (!userId) return;
    await supabase.from('user_custom_lists')
      .delete()
      .eq('id', listId)
      .eq('user_id', userId);
    setLists(prev => prev.filter(l => l.id !== listId));
  }, [userId]);

  const renameList = useCallback(async (listId, name) => {
    if (!userId || !name?.trim()) return;
    const { data } = await supabase
      .from('user_custom_lists')
      .update({ name: name.trim() })
      .eq('id', listId)
      .eq('user_id', userId)
      .select()
      .single();
    if (data) setLists(prev => prev.map(l => l.id === listId ? { ...l, name: data.name } : l));
  }, [userId]);

  const addItem = useCallback(async (listId, item) => {
    if (!userId) return;
    const tmdbId = tmdbIdFromItem(item);
    if (!tmdbId) return;
    const row = mediaIdentityRow(item);
    if (!row) return;

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
      return;
    }
    if (data) {
      setLists(prev => prev.map(l =>
        l.id === listId
          ? { ...l, items: [data, ...(l.items || []).filter(i => i.tmdb_id !== tmdbId)] }
          : l
      ));
    }
  }, [userId]);

  const removeItem = useCallback(async (listId, tmdbId) => {
    if (!userId) return;
    await supabase.from('user_custom_list_items')
      .delete()
      .eq('list_id', listId)
      .eq('user_id', userId)
      .eq('tmdb_id', Number(tmdbId));
    setLists(prev => prev.map(l =>
      l.id === listId
        ? { ...l, items: (l.items || []).filter(i => i.tmdb_id !== Number(tmdbId)) }
        : l
    ));
  }, [userId]);

  const isInList = useCallback((listId, tmdbId) => {
    const list = lists.find(l => l.id === listId);
    return list?.items?.some(i => i.tmdb_id === Number(tmdbId)) ?? false;
  }, [lists]);

  return { lists, loading, createList, deleteList, renameList, addItem, removeItem, isInList };
}
