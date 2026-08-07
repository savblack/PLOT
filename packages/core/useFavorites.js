import { useState, useEffect, useCallback } from 'react';
import { supabase } from './supabase.js';
import { mediaIdentityRow, tmdbIdFromItem } from './media.js';
import { findHistoryEntry, logWatchedItem, saveFavorite } from './userMedia.js';
import { markMediaAsWatched } from './mediaStatus.js';
import { emit } from './events.js';
import { HISTORY_CHANGED_EVENT } from './useHistory.js';

/**
 * Favourited titles for a user.
 * @param {string|null|undefined} userId
 * @param {{ watching?: any, watchlist?: any }} [deps] - sibling hooks consulted
 *   (and updated) when favouriting defaults a title's watch status to watched.
 * @returns {{
 *   favorites: any[];
 *   loading: boolean;
 *   isFavorite: (tmdbId: number) => boolean;
 *   toggleFavorite: (item: any) => Promise<any>;
 * }}
 */
export function useFavorites(userId, { watching, watchlist } = {}) {
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

  // eslint-disable-next-line react-hooks/set-state-in-effect -- loading is delegated to the stable loader callback
  useEffect(() => { load(); }, [load]);

  const isFavorite = useCallback(
    (tmdbId) => favorites.some(f => f.tmdb_id === Number(tmdbId)),
    [favorites]
  );

  /* Liking a title is a strong signal you've already seen it, so favouriting
     defaults the watch status to watched — same transition the manual "Mark
     as Watched" action makes (clears an in-progress "watching"/"want to
     watch" state to match). Only runs on not-favourite → favourite, and only
     when nothing has logged a watch for this title yet, so it never
     overwrites an existing history entry (e.g. a past watch, or dnf) and
     unfavouriting never touches watch status — the user can always change it
     manually afterwards. */
  const defaultToWatched = useCallback(async (item, tmdbId, mediaType) => {
    try {
      const existing = await findHistoryEntry({ userId, tmdbId, mediaType });
      if (existing) return;

      let insertedId = null;
      const result = await markMediaAsWatched({
        logWatched: async () => {
          const { data, error } = await logWatchedItem({ userId, item });
          if (error || !data) return false;
          insertedId = data.id;
          emit(HISTORY_CHANGED_EVENT);
          return true;
        },
        clearWatching:   () => watching.stopWatching(tmdbId),
        removeFromSaved: () => watchlist.removeFromList(tmdbId),
        rollbackHistory: async () => {
          if (!insertedId) return;
          await supabase.from('history').delete().eq('id', insertedId);
          emit(HISTORY_CHANGED_EVENT);
        },
        // Movie/TV tmdb ids can collide (see userMedia.js), so only ever treat
        // this as "currently watching" for TV, matching MediaPanel's own guard.
        shouldClearWatching:   mediaType === 'tv' && !!watching?.isWatching?.(tmdbId),
        shouldRemoveFromSaved: !!watchlist?.isInList?.(tmdbId),
      });

      if (!result.ok) console.error('[useFavorites] could not default watch status to watched:', result.error);
    } catch (e) {
      console.error('[useFavorites] default-to-watched failed', e);
    }
  }, [userId, watching, watchlist]);

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
      const row = mediaIdentityRow(item);
      if (!row) return;

      const optimistic = {
        id: `optimistic-${tmdbId}`,
        user_id: userId,
        ...row,
      };
      setFavorites(prev => (
        prev.some(f => f.tmdb_id === tmdbId) ? prev : [optimistic, ...prev]
      ));

      const { data, error } = await saveFavorite({ userId, item });

      if (error) {
        console.error('Failed to save favourite', error);
        setFavorites(prev => prev.filter(f => f.tmdb_id !== tmdbId));
        return;
      }

      if (data) {
        setFavorites(prev => [data, ...prev.filter(f => f.tmdb_id !== tmdbId)]);
        await defaultToWatched(item, tmdbId, row.media_type);
      }
    }
  }, [userId, favorites, isFavorite, defaultToWatched]);

  return { favorites, loading, isFavorite, toggleFavorite };
}
