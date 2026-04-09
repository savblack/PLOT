import { useState, useEffect } from 'react';
import { supabase } from '../api/supabase';

export function useJournalData(user, onAuthRequired) {
  const [watched, setWatched] = useState(() => {
    try { return JSON.parse(localStorage.getItem('plot-watched') || '[]'); } catch { return []; }
  });
  const [userLists, setUserLists] = useState([]);
  const [listItems, setListItems] = useState([]);
  const [activeList, setActiveList] = useState(null);

  // Sync with Supabase when user is logged in
  useEffect(() => {
    if (!user) return;
    const fetchJournal = async () => {
      const { data } = await supabase
        .from('journal')
        .select('*')
        .order('watched_at', { ascending: false });
      if (data) setWatched(data.map(i => ({ ...i, id: i.tmdb_id })));
    };
    const fetchLists = async () => {
      const { data: lists } = await supabase.from('lists').select('*');
      if (lists) setUserLists(lists);
      const { data: items } = await supabase.from('list_items').select('*').order('created_at', { ascending: false });
      if (items) setListItems(items);
    };
    fetchJournal();
    fetchLists();
  }, [user]);

  const getSavedData = (id) => watched.find(i => i.id === id);

  const saveToWatched = async (item) => {
    if (user) {
      const entry = {
        user_id:     user.id,
        tmdb_id:     item.tmdb_id || item.id,
        media_type:  item.media_type || (item.title ? 'movie' : 'tv'),
        title:       item.title || item.name || null,
        poster_path: item.poster_path || null,
        rating:      item.rating || null,
        note:        item.note || null,
        mood:        item.mood || null,
        watchStatus: item.watchStatus || null,
        watched_at:  item.watched_at || null,
        updatedAt:   item.updatedAt || null,
        genre_ids:   item.genre_ids || null,
      };
      const { error } = await supabase
        .from('journal')
        .upsert(entry, { onConflict: 'user_id, tmdb_id' });
      if (error) {
        console.error('Supabase Sync Error:', error);
      } else {
        setWatched(prev => {
          const idToFind = item.id || item.tmdb_id;
          const existing = prev.findIndex(i => i.id === idToFind || i.tmdb_id === idToFind);
          const updatedItem = { ...item, id: idToFind };
          if (existing > -1) {
            const update = [...prev];
            update[existing] = updatedItem;
            return update;
          }
          return [updatedItem, ...prev];
        });
      }
    } else {
      const updated = [...watched];
      const existing = updated.findIndex(i => i.id === item.id);
      if (existing > -1) {
        updated[existing] = item;
      } else {
        updated.unshift(item);
      }
      setWatched(updated);
      localStorage.setItem('plot-watched', JSON.stringify(updated));
    }
  };

  const createList = async (name) => {
    if (!user) {
      onAuthRequired?.();
      return;
    }
    const { data, error } = await supabase
      .from('lists')
      .insert({ name, user_id: user.id })
      .select()
      .single();
    if (error) console.error('createList error:', error);
    if (data) setUserLists(prev => [...prev, data]);
    return data;
  };

  const deleteList = async (listId) => {
    const { error: itemsError } = await supabase.from('list_items').delete().match({ list_id: listId });
    if (itemsError) { console.error('deleteList items error:', itemsError); alert('Failed to delete list. Please try again.'); return; }
    const { error: listError } = await supabase.from('lists').delete().match({ id: listId });
    if (listError) { console.error('deleteList error:', listError); alert('Failed to delete list. Please try again.'); return; }
    setUserLists(prev => prev.filter(l => l.id !== listId));
    setListItems(prev => prev.filter(li => li.list_id !== listId));
    setActiveList(null);
  };

  const renameList = async (listId, newName) => {
    if (!newName.trim()) return;
    const { error } = await supabase.from('lists').update({ name: newName.trim() }).match({ id: listId });
    if (!error) {
      setUserLists(prev => prev.map(l => l.id === listId ? { ...l, name: newName.trim() } : l));
      setActiveList(prev => ({ ...prev, name: newName.trim() }));
    }
  };

  const toggleListItem = async (listId, item, isAdding) => {
    if (!user) return;
    if (isAdding) {
      const { data } = await supabase
        .from('list_items')
        .insert({
          list_id: listId,
          user_id: user.id,
          tmdb_id: item.id,
          media_type: item.media_type || (item.title ? 'movie' : 'tv'),
          title: item.title || item.name,
          poster_path: item.poster_path,
        })
        .select()
        .single();
      if (data) setListItems(prev => [data, ...prev]);
    } else {
      const { error } = await supabase
        .from('list_items')
        .delete()
        .match({ list_id: listId, tmdb_id: item.id });
      if (!error) setListItems(prev => prev.filter(i => !(i.list_id === listId && i.tmdb_id === item.id)));
    }
  };

  const deleteFromJournal = async (tmdbIds) => {
    if (!user) return;
    const { error: journalError } = await supabase.from('journal').delete().in('tmdb_id', tmdbIds);
    if (journalError) { console.error('deleteFromJournal error:', journalError); alert('Failed to delete entry. Please try again.'); return; }
    await supabase.from('list_items').delete().in('tmdb_id', tmdbIds).eq('user_id', user.id);
    setWatched(prev => prev.filter(w => !tmdbIds.includes(w.tmdb_id || w.id)));
    setListItems(prev => prev.filter(li => !tmdbIds.includes(li.tmdb_id)));
  };

  const toggleListPublic = async (listId) => {
    const list = userLists.find(l => l.id === listId);
    if (!list) return;
    const next = !list.is_public;
    const { error } = await supabase.from('lists').update({ is_public: next }).eq('id', listId);
    if (!error) {
      setUserLists(prev => prev.map(l => l.id === listId ? { ...l, is_public: next } : l));
      if (activeList?.id === listId) setActiveList(prev => ({ ...prev, is_public: next }));
    }
  };

  return {
    watched, setWatched,
    userLists, listItems,
    activeList, setActiveList,
    getSavedData, saveToWatched,
    createList, deleteList, renameList,
    toggleListItem, deleteFromJournal, toggleListPublic,
  };
}
