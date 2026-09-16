import { PRIVATE_NOTES } from './copy/privateNotes.js';

export const PRIVATE_NOTE_LIMIT = 1000;
export const privateNoteKey = (id, type) => `${type}:${id}`;
export const noteLength = text => Array.from(text).length;

export function validatePrivateNote(id, type, text) {
  if (!Number.isSafeInteger(id) || id <= 0 || !['movie', 'tv'].includes(type)) throw new Error(PRIVATE_NOTES.invalid);
  if (typeof text !== 'string' || noteLength(text) > PRIVATE_NOTE_LIMIT) throw new Error(PRIVATE_NOTES.tooLong);
  return text.trim();
}

// Separate table, never merged into title/list/review objects or share payloads.
export async function loadPrivateNotes(client, userId) {
  const rows = [];
  for (let offset = 0; ; offset += 500) {
    const { data, error } = await client.from('private_title_notes')
      .select('tmdb_id,media_type,note,revision').eq('user_id', userId)
      .order('tmdb_id').order('media_type').range(offset, offset + 499);
    if (error) throw new Error(PRIVATE_NOTES.loadError);
    rows.push(...(data || []));
    if (!data || data.length < 500) return Object.fromEntries(rows.map(row => [privateNoteKey(row.tmdb_id, row.media_type), row]));
  }
}

/**
 * @param {any} client Supabase client, injectable for domain tests.
 * @param {{id: number, type: string, text: string, revision: number, title?: string, userId?: string}} input
 */
export async function savePrivateNote(client, { id, type, text, revision, title, userId }) {
  const note = validatePrivateNote(id, type, text);
  const { data, error } = await client.rpc('save_private_title_note', {
    p_user_id: userId, p_tmdb_id: id, p_media_type: type, p_note: note,
    p_expected_revision: revision, p_title: title || '',
  });
  if (error) {
    const conflict = error.code === '40001';
    throw Object.assign(new Error(conflict ? PRIVATE_NOTES.conflict : PRIVATE_NOTES.saveError), { conflict });
  }
  return data;
}
