// What a title card on a list page knows and can do: its review and private
// note markers, and the heart / bookmark toggles. Shared by the custom list and
// smart list pages; kept out of ListSections.jsx so that file only exports
// components (fast refresh).
import { privateNoteKey } from '@plot/core/privateNotes.js';
import { listWatchStatus } from '@plot/core/listWatchStatus.js';
import { MEDIA } from '../copy/media.js';
import { FAVOURITES_ENABLED } from '@plot/core/features.js';

export function cardState(item, historyEntries, privateNotes, watchingItems) {
  const id = Number(item.tmdb_id);
  const type = item.media_type || 'movie';
  return {
    hasPrivateNote: !!privateNotes?.rows?.[privateNoteKey(id, type)]?.note,
    hasReview: historyEntries?.some(entry => entry.tmdb_id === id && entry.media_type === type && !!entry.note) || false,
    watchStatus: listWatchStatus(item, historyEntries, watchingItems),
  };
}

export function cardActions(item, favorites, watchlist, fw) {
  const id = Number(item.tmdb_id);
  const type = item.media_type || 'movie';
  const normalized = { ...item, id, tmdb_id: id, media_type: type };
  const isFavorite = favorites.isFavorite(id);
  const isBookmarked = watchlist.isInList(id);
  // No onToggleFavorite means ListCard draws no heart.
  const favourite = FAVOURITES_ENABLED ? {
    isFavorite,
    favoriteLabel: isFavorite ? `Remove ${item.title || item.name} from ${fw.pluralLower}` : `Add ${item.title || item.name} to ${fw.pluralLower}`,
    onToggleFavorite: () => favorites.toggleFavorite(normalized),
  } : {};
  return {
    ...favourite,
    isBookmarked,
    bookmarkLabel: isBookmarked ? MEDIA.removeFromWatchlist : MEDIA.saveToWatchlist,
    onToggleBookmark: () => watchlist.toggle(normalized),
  };
}
