import { useState, useEffect, useCallback } from 'react';
import { supabase } from '../api/supabase.js';

export function useFavorites(userId) {
  const [favorites, setFavorites] = useState([]);
  const [loading,   setLoading]   = useState(true);

  const load = useCallback(async () => {
    if (!userId) { setLoading(false); return; }
    const { data } = await supabase
      .from('user_favourites')
      .select('*')
      .eq('user_id', userId)
      .order('created_at', { ascending: false });
    setFavorites(data || []);
    setLoading(false);
  }, [userId]);

  useEffect(() => { load(); }, [load]);

  const isFavorite = useCallback(
    (tmdbId) => favorites.some(f => f.tmdb_id === Number(tmdbId)),
    [favorites]
  );

  const toggleFavorite = useCallback(async (item) => {
    if (!userId) return;
    const tmdbId = Number(item.id || item.tmdb_id);

    if (isFavorite(tmdbId)) {
      await supabase.from('user_favourites')
        .delete()
        .eq('user_id', userId)
        .eq('tmdb_id', tmdbId);
      setFavorites(prev => prev.filter(f => f.tmdb_id !== tmdbId));
    } else {
      const { data } = await supabase
        .from('user_favourites')
        .insert({
          user_id:     userId,
          tmdb_id:     tmdbId,
          media_type:  item.media_type || 'movie',
          title:       item.title || item.name || '',
          poster_path: item.poster_path || null,
        })
        .select()
        .single();
      if (data) setFavorites(prev => [data, ...prev]);
    }
  }, [userId, isFavorite]);

  return { favorites, loading, isFavorite, toggleFavorite };
}
