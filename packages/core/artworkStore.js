import { supabase } from './supabase.js';
import { artworkRecord, artworkSubject } from './artwork.js';

const TABLE = 'user_artwork';
const PAGE = 1000;

function sameSubject(query, userId, subject) {
  return query
    .eq('user_id', userId)
    .eq('subject_type', subject.subject_type)
    .eq('tmdb_id', subject.tmdb_id)
    .eq('season_number', subject.season_number)
    .eq('kind', subject.kind);
}

async function updateArtwork(row) {
  const { data, error } = await sameSubject(
    supabase.from(TABLE).update({ file_path: row.file_path, updated_at: row.updated_at }),
    row.user_id,
    row,
  ).select('*');
  if (error) throw error;
  return data?.[0] ?? null;
}

/** Every saved choice for one account. A short page is never treated as the whole set.
 * @param {string} userId
 */
export async function readUserArtwork(userId) {
  if (!userId) return [];
  const rows = [];
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await supabase.from(TABLE).select('*').eq('user_id', userId)
      .order('updated_at').range(from, from + PAGE - 1);
    if (error) throw error;
    rows.push(...(data || []));
    if (!data || data.length < PAGE) break;
  }
  return rows;
}

/** Replace a choice, or add it when this account has not saved one yet.
 * @param {string} userId
 * @param {{ subjectType?: string, tmdbId?: number, seasonNumber?: number, kind?: string, filePath?: string }} choice
 */
export async function saveUserArtwork(userId, choice) {
  const row = artworkRecord(userId, choice);
  if (!row) throw new Error('Invalid artwork');
  const updated = await updateArtwork(row);
  if (updated) return updated;
  const { data, error } = await supabase.from(TABLE).insert(row).select('*');
  if (error?.code === '23505') {
    const raced = await updateArtwork(row);
    if (raced) return raced;
  }
  if (error) throw error;
  if (!data?.[0]) throw new Error('Artwork update was not confirmed');
  return data[0];
}

/** Remove one choice. Allowed after Premium lapses.
 * @param {string} userId
 * @param {{ subjectType?: string, tmdbId?: number, seasonNumber?: number, kind?: string }} choice
 */
export async function clearUserArtwork(userId, choice) {
  const subject = artworkSubject(choice);
  if (!userId || !subject) throw new Error('Invalid artwork');
  const { error } = await sameSubject(supabase.from(TABLE).delete(), userId, subject);
  if (error) throw error;
}
