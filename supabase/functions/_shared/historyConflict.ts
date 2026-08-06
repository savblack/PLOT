// The unique constraint every history upsert targets, for the edge functions.
//
// Mirrors HISTORY_CONFLICT_TARGET in packages/core/userMedia.js. Edge functions
// run on Deno and cannot import the npm workspace, so the value is restated
// here rather than shared — scripts/check-db-write-paths.mjs resolves both
// against the live database, so a drift between them fails the check.
//
// Must stay in step with history_user_id_tmdb_id_media_type_watched_at_key
// (migration 20260727010000). Naming a constraint that no longer exists does
// not fail loudly: PostgREST answers 42P10 and the write simply never happens.
// These two functions carried the pre-20260725 target `user_id,tmdb_id` long
// after it was dropped, so a Plex or Trakt sync would have reported success and
// written no history at all.
export const HISTORY_CONFLICT_TARGET = 'user_id,tmdb_id,media_type,watched_at'

/**
 * Collapse rows that would collide on that key before they reach the database.
 *
 * Postgres rejects an ON CONFLICT batch that touches the same row twice
 * ("cannot affect row a second time", 21000) and takes every other row in the
 * batch with it. Plex and Trakt both report a title once per episode or per
 * play, so a single sync routinely yields several rows for one title on one
 * date. Last one wins, matching the upsert that follows.
 */
export function dedupeHistoryRows<T extends { tmdb_id: number; media_type: string; watched_at: string }>(rows: T[]): T[] {
  const byKey = new Map<string, T>()
  for (const row of rows) byKey.set(`${row.tmdb_id}::${row.media_type}::${row.watched_at}`, row)
  return [...byKey.values()]
}
