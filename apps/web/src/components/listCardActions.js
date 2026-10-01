// What a title card on a list page knows and can do: its review and private
// note markers, and the heart / bookmark toggles. Shared by the custom list and
// smart list pages; kept out of ListSections.jsx so that file only exports
// components (fast refresh).
import { privateNoteKey } from '@plot/core/privateNotes.js';
import { MEDIA } from '../copy/media.js';

export function cardState(item, historyEntries, privateNotes) {
  const id = Number(item.tmdb_id);
  const type = item.media_type || 'movie';
  return {
    hasPrivateNote: !!privateNotes?.rows?.[privateNoteKey(id, type)]?.note,
    hasReview: historyEntries?.some(entry => entry.tmdb_id === id && entry.media_type === type && !!entry.note) || false,
  };
}

export function cardActions(item, favorites, watchlist, fw) {
  const id = Number(item.tmdb_id);
  const type = item.media_type || 'movie';
  const normalized = { ...item, id, tmdb_id: id, media_type: type };
  const isFavorite = favorites.isFavorite(id);
  const isBookmarked = watchlist.isInList(id);
  return {
    isFavorite,
    isBookmarked,
    favoriteLabel: isFavorite ? `Remove ${item.title || item.name} from ${fw.pluralLower}` : `Add ${item.title || item.name} to ${fw.pluralLower}`,
    bookmarkLabel: isBookmarked ? MEDIA.removeFromWatchlist : MEDIA.saveToWatchlist,
    onToggleFavorite: () => favorites.toggleFavorite(normalized),
    onToggleBookmark: () => watchlist.toggle(normalized),
  };
}
