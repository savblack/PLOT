import { supabase } from './supabase.js';

/** @param {{ season_number: number, episode_number: number }[]} events
 * @param {{ season_number: number, episode_number: number, watched: boolean }[]} overrides
 * @returns {Record<string, boolean>}
 */
export function episodeWatchStates(events, overrides) {
  const states = {};
  for (const event of events) {
    if (event.season_number != null && event.episode_number != null) {
      states[`${event.season_number}:${event.episode_number}`] = true;
    }
  }
  // A PLOT correction wins over all source events, including later reimports.
  for (const override of overrides) states[`${override.season_number}:${override.episode_number}`] = override.watched;
  return states;
}

/** Read every episode for one account/title. Never return a partially read map.
 * @param {string} userId
 * @param {number} tmdbId
 */
export async function readEpisodeWatches(userId, tmdbId) {
  const tables = [];
  for (const table of ['watch_events', 'episode_watch_overrides']) {
    const rows = [];
    for (let from = 0; ; from += 1000) {
      let query = supabase.from(table).select('*').eq('user_id', userId).eq('tmdb_id', tmdbId);
      if (table === 'watch_events') query = query.eq('media_type', 'tv');
      const { data, error } = await query.order('id').range(from, from + 999);
      if (error) throw error;
      rows.push(...(data || []));
      if (!data || data.length < 1000) break;
    }
    tables.push(rows);
  }
  return episodeWatchStates(tables[0], tables[1]);
}

/** One atomic statement for episode or season edits. No source events are deleted.
 * @param {string} userId
 * @param {number} tmdbId
 * @param {number} season
 * @param {number[]} episodes Actual episode ordinals from the loaded catalogue.
 * @param {boolean} watched
 */
export async function saveEpisodeWatches(userId, tmdbId, season, episodes, watched) {
  if (!userId || !Number.isSafeInteger(tmdbId) || tmdbId <= 0 || !Number.isInteger(season) || season < 0 ||
      !episodes.length || episodes.some(ep => !Number.isInteger(ep) || ep < 1) || typeof watched !== 'boolean') {
    throw new Error('Invalid episode selection');
  }
  const rows = [...new Set(episodes)].map(episode => ({ user_id: userId, tmdb_id: tmdbId,
    season_number: season, episode_number: episode, watched, updated_at: new Date().toISOString() }));
  const { data, error } = await supabase.from('episode_watch_overrides')
    .upsert(rows, { onConflict: 'user_id,tmdb_id,season_number,episode_number' }).select('*');
  if (error) throw error;
  if (data?.length !== rows.length) throw new Error('Episode update was not confirmed');
  return episodeWatchStates([], data);
}
