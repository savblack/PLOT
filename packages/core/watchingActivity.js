import { supabase } from './supabase.js';
import { latestActivityByShow } from './watchingOrder.js';

// Newest rows only. A show missing from the window has no event newer than
// the oldest row in it, so it can only sit below every show that is in it;
// it falls back to its pointer time there. 1000 is PostgREST's page size.
const WINDOW = 1000;

/**
 * Latest owner-only activity for the shows a user is watching (see
 * watchingOrder.js). Best effort: a failed read leaves that source out and the
 * list falls back to pointer time, rather than failing the Watching load.
 * @param {string} userId
 * @param {number[]} tmdbIds
 * @returns {Promise<Map<number, string>>}
 */
export async function readWatchingActivity(userId, tmdbIds) {
  const ids = [...new Set((tmdbIds ?? []).map(Number).filter(Boolean))];
  if (!userId || !ids.length) return new Map();
  const read = async (query) => {
    try {
      const { data, error } = await query;
      return error ? [] : (data ?? []);
    } catch { return []; }
  };
  const [events, overrides, history] = await Promise.all([
    read(supabase.from('watch_events').select('tmdb_id, created_at')
      .eq('user_id', userId).eq('media_type', 'tv').in('tmdb_id', ids)
      .order('created_at', { ascending: false }).limit(WINDOW)),
    read(supabase.from('episode_watch_overrides').select('tmdb_id, watched, updated_at')
      .eq('user_id', userId).eq('watched', true).in('tmdb_id', ids)
      .order('updated_at', { ascending: false }).limit(WINDOW)),
    read(supabase.from('history').select('tmdb_id, created_at')
      .eq('user_id', userId).eq('media_type', 'tv').in('tmdb_id', ids)
      .order('created_at', { ascending: false }).limit(WINDOW)),
  ]);
  return latestActivityByShow({ events, overrides, history });
}
