// The unique constraint every history upsert targets, for the edge functions.
//
// Mirrors HISTORY_CONFLICT_TARGET in packages/core/userMedia.js. Edge functions
// run on Deno and cannot import the npm workspace, so the value is restated
// here rather than shared — scripts/check-db-write-paths.mjs resolves both
// against the live database, so a drift between them fails the check.
//
// Must stay in step with history_user_id_tmdb_id_media_type_key (migration
// 20260806000001). Naming a constraint that no longer exists does not fail
// loudly: PostgREST answers 42P10 and the write simply never happens. These two
// functions carried the pre-20260725 target `user_id,tmdb_id` long after it was
// dropped, so a Plex or Trakt sync would have reported success and written no
// history at all.
//
// watched_at is not part of the key: history holds one row per title, so
// watching something again moves that row's date rather than adding another.
export const HISTORY_CONFLICT_TARGET = 'user_id,tmdb_id,media_type'

/**
 * Collapse rows that would collide on that key before they reach the database.
 *
 * Postgres rejects an ON CONFLICT batch that touches the same row twice
 * ("cannot affect row a second time", 21000) and takes every other row in the
 * batch with it. Plex and Trakt both report a title once per episode or per
 * play, so a single sync routinely yields several rows for one title.
 *
 * The most recent watch wins, chosen by comparing dates rather than by keeping
 * whichever row happened to arrive last: sync ordering is not something to
 * depend on, and the surviving row should be the one the user calls current.
 */
export function dedupeHistoryRows<T extends { tmdb_id: number; media_type: string; watched_at: string }>(rows: T[]): T[] {
  const byKey = new Map<string, T>()
  for (const row of rows) {
    const key = `${row.tmdb_id}::${row.media_type}`
    const seen = byKey.get(key)
    if (!seen || row.watched_at > seen.watched_at) byKey.set(key, row)
  }
  return [...byKey.values()]
}
