import type { SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2'
import type { Database } from './database.types.ts'
import { HISTORY_CONFLICT_TARGET, dedupeHistoryRows } from './historyConflict.ts'

type Db = SupabaseClient<Database>

export type ImportedHistoryRow = {
  user_id: string
  tmdb_id: number
  media_type: string
  title: string
  poster_path: string | null
  watched_at: string
}

const READ_BATCH = 200
const WRITE_BATCH = 200

/**
 * Add history from a one-off external import without changing anything the
 * user already has in Plot. In particular, an imported date must never flatten
 * a rating, review or private note attached to an existing history row.
 */
export async function insertMissingHistory(
  supabaseAdmin: Db,
  userId: string,
  rows: ImportedHistoryRow[],
) {
  const uniqueRows = dedupeHistoryRows(rows)
  if (uniqueRows.length === 0) return { importedCount: 0, alreadyCount: 0 }

  const existingKeys = new Set<string>()
  const tmdbIds = [...new Set(uniqueRows.map(row => row.tmdb_id))]

  for (let i = 0; i < tmdbIds.length; i += READ_BATCH) {
    const { data, error } = await supabaseAdmin
      .from('history')
      .select('tmdb_id, media_type')
      .eq('user_id', userId)
      .in('tmdb_id', tmdbIds.slice(i, i + READ_BATCH))
    if (error) throw error
    for (const row of data || []) existingKeys.add(`${row.tmdb_id}::${row.media_type}`)
  }

  const missingRows = uniqueRows.filter(
    row => !existingKeys.has(`${row.tmdb_id}::${row.media_type}`),
  )

  let importedCount = 0
  for (let i = 0; i < missingRows.length; i += WRITE_BATCH) {
    const batch = missingRows.slice(i, i + WRITE_BATCH)
    const { count, error } = await supabaseAdmin
      .from('history')
      .upsert(batch, {
        onConflict: HISTORY_CONFLICT_TARGET,
        ignoreDuplicates: true,
        count: 'exact',
      })
    if (error) throw error
    importedCount += count ?? batch.length
  }

  return {
    importedCount,
    alreadyCount: uniqueRows.length - importedCount,
  }
}
