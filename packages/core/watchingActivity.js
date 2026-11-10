import { supabase } from './supabase.js';
import { latestWatching } from './watchingOrder.js';

/**
 * Latest outside activity (imports, title-page ticks, History logs) for the
 * shows a user is watching, as tmdb_id → watching_progress.last_activity_at.
 * The database keeps that column current (20261111100000; see
 * watchingOrder.js), so this is the one column, not the three source tables.
 * Best effort: a failed read returns an empty map and the list keeps the
 * order it had, rather than failing the Watching load.
 * @param {string} userId
 * @param {number[]} tmdbIds
 * @returns {Promise<Map<number, string>>}
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
    if (error) return byId;
    for (const row of data ?? []) {
      if (row.last_activity_at) byId.set(Number(row.tmdb_id), row.last_activity_at);
    }
  } catch { /* best effort */ }
  return byId;
}

const PUBLIC_WATCHING_COLUMNS = 'tmdb_id, title, poster_path, current_season, current_episode, updated_at, last_activity_at';

/**
 * Someone's most recently watched shows, in the order they see them
 * themselves, for a visitor's view of their profile. RLS decides whether the
 * rows are readable at all (public profile, or an accepted follower).
 * @param {string} userId
 * @param {number} limit
 * @returns {Promise<{ data: any[], error: any }>}
 */
export async function readLatestWatching(userId, limit) {
  const [byPointer, byActivity] = await Promise.all([
    supabase.from('watching_progress').select(PUBLIC_WATCHING_COLUMNS)
      .eq('user_id', userId).order('updated_at', { ascending: false }).limit(limit),
    supabase.from('watching_progress').select(PUBLIC_WATCHING_COLUMNS)
      .eq('user_id', userId).not('last_activity_at', 'is', null)
      .order('last_activity_at', { ascending: false }).limit(limit),
  ]);
  // The pointer page alone is still a valid (older) order, so a failed
  // activity read degrades to it instead of emptying the shelf.
  if (byPointer.error) return { data: [], error: byPointer.error };
  return { data: latestWatching(byPointer.data, byActivity.error ? [] : byActivity.data, limit), error: null };
}
