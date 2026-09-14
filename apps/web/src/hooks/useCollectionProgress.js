import { useApp } from './useApp.js';
import { collectionProgress } from '@plot/core/collections.js';

/**
 * Per-part state and header numbers for a collection, from the app's own
 * watchlist and the caller's history hook. Shared by the card on a movie
 * and the collection panel so both count the same way.
 */
export function useCollectionProgress(parts, { currentId = null, history }) {
  const { watchlist } = useApp();
  return collectionProgress(parts, {
    currentId,
    isWatched: history.isWatched,
    isInWatchlist: watchlist.isInList,
  });
}
