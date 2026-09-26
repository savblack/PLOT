import { getConfig } from './config.js';
import { supabase } from './supabase.js';
import { importEventIdentity } from './importEvents.js';

/** Preserve annotations without changing history, notes or list membership.
 * @param {{userId: string, resolved: any[], onProgress?: (done: number, total: number)=>void}} input
 */
export async function writeImportedAnnotations({ userId, resolved, onProgress }) {
  const matched = resolved.filter(row => row.status === 'matched');
  if (!userId || !getConfig().importAnnotationsEnabled) return { inserted: 0, duplicates: 0, failed: matched.length };
  let records;
  try {
    records = matched.map(row => {
      if (!row.annotation || !['rating','review'].includes(row.annotation.kind) || !Number.isSafeInteger(row.tmdbId) || row.tmdbId <= 0 || !['movie','tv'].includes(row.mediaType)) throw new Error('A confirmed annotation is required');
      return { source: row.source, source_key: importEventIdentity(row), tmdb_id: row.tmdbId, media_type: row.mediaType,
        annotation_scope: row.annotationScope, season_number: row.seasonNumber ?? null, episode_number: row.episodeNumber ?? null,
        annotation: row.annotation, external_ids: row.externalIds || {} };
    });
  } catch { return { inserted: 0, duplicates: 0, failed: matched.length }; }
  let inserted = 0, duplicates = 0, failed = 0;
  for (let offset = 0; offset < records.length; offset += 50) {
    const batch = records.slice(offset, offset + 50);
    try {
      const { data, error } = await supabase.rpc('import_saved_annotations', { p_records: batch });
      if (error) failed += batch.length;
      else { inserted += data.inserted; duplicates += data.duplicates; }
    } catch { failed += batch.length; }
    onProgress?.(Math.min(offset + batch.length, records.length), records.length);
  }
  return { inserted, duplicates, failed };
}
