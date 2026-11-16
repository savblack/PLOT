// The two small markers on a title card on a list page: a private note you
// wrote on the title, and a review (a note on one of your watches). Shared by
// web's ListCards and the iPhone's list posters so both apps mark the same
// titles.
import { privateNoteKey } from './privateNotes.js';

/**
 * @param {{ tmdb_id?: number | string, id?: number | string, media_type?: string }} item
 * @param {{ tmdb_id?: number, media_type?: string, note?: string | null }[] | null | undefined} historyEntries
 * @param {{ rows?: Record<string, { note?: string | null } | undefined> } | null | undefined} privateNotes
 * @returns {{ hasPrivateNote: boolean, hasReview: boolean }}
 */
export function listCardMarkers(item, historyEntries, privateNotes) {
  const id = Number(item.tmdb_id ?? item.id);
  const type = item.media_type || 'movie';
  return {
    hasPrivateNote: !!privateNotes?.rows?.[privateNoteKey(id, type)]?.note,
    hasReview: historyEntries?.some(entry => entry.tmdb_id === id && entry.media_type === type && !!entry.note) || false,
  };
}
