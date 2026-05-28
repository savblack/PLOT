import { useState, useEffect, useCallback } from 'react';
import { supabase } from '../api/supabase.js';
import { baseMediaRow, tmdbIdFromItem } from '../domain/media.js';

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
    const tmdbId = tmdbIdFromItem(item);
    if (!tmdbId) return;

    if (isFavorite(tmdbId)) {
      const previous = favorites;
      setFavorites(prev => prev.filter(f => f.tmdb_id !== tmdbId));

      const { error } = await supabase.from('user_favourites')
        .delete()
        .eq('user_id', userId)
        .eq('tmdb_id', tmdbId);

      if (error) {
        console.error('Failed to remove favourite', error);
        setFavorites(previous);
      }
    } else {
      const row = baseMediaRow(item);
      if (!row) return;

      const optimistic = {
        id: `optimistic-${tmdbId}`,
        user_id: userId,
        ...row,
      };
      setFavorites(prev => (
        prev.some(f => f.tmdb_id === tmdbId) ? prev : [optimistic, ...prev]
      ));

      const { data, error } = await supabase
        .from('user_favourites')
        .upsert({
          user_id:     userId,
          ...row,
        }, { onConflict: 'user_id,tmdb_id' })
        .select()
        .single();

      if (error) {
        console.error('Failed to save favourite', error);
        setFavorites(prev => prev.filter(f => f.tmdb_id !== tmdbId));
        return;
      }

      if (data) {
        setFavorites(prev => [data, ...prev.filter(f => f.tmdb_id !== tmdbId)]);
      }
    }
  }, [userId, favorites, isFavorite]);

  return { favorites, loading, isFavorite, toggleFavorite };
}
