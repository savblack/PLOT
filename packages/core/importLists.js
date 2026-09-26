import { emit, LISTS_CHANGED_EVENT } from './events.js';
import { getConfig } from './config.js';
import { supabase } from './supabase.js';
import { importEventIdentity } from './importEvents.js';

/** List membership is deliberately separate from watch events and history.
 * @param {{ userId: string, resolved: any[], onProgress?: (done:number,total:number)=>void }} args
 */
export async function writeImportedList({ userId, resolved, onProgress }) {
  const destination = resolved[0]?.destination;
  const matched = resolved.filter(row => row.status === 'matched');
  const unavailable = reason => ({ inserted: 0, duplicates: 0, failed: matched.length, notImported: reason });
  if (!getConfig().importEventsEnabled) return unavailable('not_available');
  if (!userId || !destination || resolved.some(row => row.destination?.key !== destination.key)) return unavailable('invalid_list');
  if (resolved[0].listSelected === false) return { inserted: 0, duplicates: 0, failed: 0, notImported: 'not_selected' };
  let inserted = 0, duplicates = 0, failed = 0;
  for (let offset = 0; offset < matched.length; offset += 50) {
    const batch = matched.slice(offset, offset + 50);
    try {
      if (batch.some(row => !Number.isSafeInteger(row.tmdbId) || row.tmdbId <= 0 || !['movie','tv'].includes(row.mediaType) || !row.tmdbTitle)) throw new Error('A confirmed title is required');
      const records = batch.map(row => ({ source_key: importEventIdentity(row), note: row.listNote || null, source_rating: row.rating ?? null, source_rated_at: row.ratedAt || null, source_metadata: row.sourceMetadata || null,
        summary: { tmdb_id: row.tmdbId, media_type: row.mediaType, title: row.tmdbTitle, poster_path: row.posterPath || null } }));
      const { data, error } = await supabase.rpc('import_saved_list', { p_list: destination, p_records: records });
      if (error) failed += batch.length;
      else if (data.not_imported) return { inserted, duplicates, failed: matched.length - inserted - duplicates, notImported: data.not_imported };
      else { inserted += data.inserted; duplicates += data.duplicates; }
    } catch { failed += batch.length; }
    onProgress?.(Math.min(offset + batch.length,matched.length),matched.length);
  }
  if (inserted) emit(LISTS_CHANGED_EVENT);
  return { inserted, duplicates, failed, notImported: '' };
}
