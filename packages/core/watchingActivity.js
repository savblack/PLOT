import { supabase } from './supabase.js';
import { latestWatching } from './watchingOrder.js';

/**
 * Latest outside activity (imports, title-page ticks, History logs) for the
 * shows a user is watching, as tmdb_id → watching_progress.last_activity_at.
 * The database recomputes that column from those tables (20261111160000; see
 * watchingOrder.js), so this reads the one column. A show with no outside
 * activity is absent from the map.
 * Best effort: a failed read returns null, and the caller keeps the order it
 * already has rather than failing the Watching load.
 * @param {string} userId
 * @param {number[]} tmdbIds
 * @returns {Promise<Map<number, string> | null>}
 */
export async function readWatchingActivity(userId, tmdbIds) {
  const ids = [...new Set((tmdbIds ?? []).map(Number).filter(Boolean))];
  /** @type {Map<number, string>} */
  const byId = new Map();
  if (!userId || !ids.length) return byId;
  try {
    const { data, error } = await supabase.from('watching_progress')
      .select('tmdb_id, last_activity_at')
      .eq('user_id', userId).in('tmdb_id', ids);
    if (error) return null;
    for (const row of data ?? []) {
      if (row.last_activity_at) byId.set(Number(row.tmdb_id), row.last_activity_at);
    }
    return byId;
  } catch { return null; }
}

const PUBLIC_WATCHING_COLUMNS = 'tmdb_id, title, poster_path, current_season, current_episode, updated_at';

/**
 * Someone's most recently watched shows, in the order they see them
 * themselves, for a visitor's view of their profile. RLS decides whether the
 * rows are readable at all (public profile, or an accepted follower).
 *
 * The pointer page does not ask for last_activity_at, so it still works if
 * this ships before the migration does; the activity page then fails and the
 * shelf falls back to pointer order. A row only on the pointer page lacks its
 * activity, which is safe: a show in the top `limit` whose activity is later
 * than its pointer is on the activity page too (latestWatching).
 * Title is the tie-break on both pages, as it is in sortWatching, so ties at
 * the cut (one import stamps many shows with the same time) keep the same set.
 * @param {string} userId
 * @param {number} limit
 * @returns {Promise<{ data: any[], error: any }>}
 */
export async function readLatestWatching(userId, limit) {
  const [byPointer, byActivity] = await Promise.all([
    supabase.from('watching_progress').select(PUBLIC_WATCHING_COLUMNS)
      .eq('user_id', userId)
      .order('updated_at', { ascending: false }).order('title', { ascending: true }).limit(limit),
    supabase.from('watching_progress').select(`${PUBLIC_WATCHING_COLUMNS}, last_activity_at`)
      .eq('user_id', userId).not('last_activity_at', 'is', null)
      .order('last_activity_at', { ascending: false }).order('title', { ascending: true }).limit(limit),
  ]);
  if (byPointer.error) return { data: [], error: byPointer.error };
  return { data: latestWatching(byPointer.data, byActivity.error ? [] : byActivity.data, limit), error: null };
}
