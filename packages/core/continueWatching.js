/**
 * Home's Continue watching shelf and its split with the Up next column.
 *
 * The rule (round 2 design): Continue watching is the shows with an episode
 * already out that you haven't watched; Up next is future air dates only; a
 * show never appears in both. Free for everyone.
 *
 * Progress is watching_progress's pointer: current_season / current_episode is
 * the next episode to watch (see watchingProgress.js). An episode is "out"
 * when it is at or before TMDB's last_episode_to_air.
 */

import { showTimeLeft } from './timeLeft.js';

/** Season/episode order. @param {number} s1 @param {number} e1 @param {number} s2 @param {number} e2 */
function compareEpisode(s1, e1, s2, e2) {
  return s1 !== s2 ? s1 - s2 : e1 - e2;
}

/**
 * Episodes in numbered seasons before (season, episode), from the details'
 * season list. Specials (season 0) never count.
 * @param {any} details @param {number} season @param {number} episode
 */
function episodesBefore(details, season, episode) {
  let count = 0;
  for (const s of details?.seasons ?? []) {
    const n = Number(s?.season_number);
    if (n >= 1 && n < season) count += Number(s.episode_count) || 0;
  }
  return count + Math.max(0, episode - 1);
}

/**
 * @typedef {object} ContinueItem
 * @property {number} tmdbId
 * @property {string} title
 * @property {string | null} posterPath
 * @property {number} season       the next episode to watch
 * @property {number} episode
 * @property {boolean} latest      the next episode is the newest one out
 * @property {number} progress     0 to 1: share of the aired episodes watched
 * @property {number} episodesLeft aired episodes from the pointer, inclusive
 * @property {number | null} minutesLeft null when a runtime cannot be filled
 */

/**
 * One show's Continue watching entry, or null when nothing out is unwatched.
 * @param {{ tmdb_id: number, title?: string, poster_path?: string | null, current_season?: number, current_episode?: number }} progress
 * @param {any} details TMDB TV details (last_episode_to_air, seasons)
 * @returns {ContinueItem | null}
 */
export function continueItem(progress, details) {
  const last = details?.last_episode_to_air;
  const season = Number(progress?.current_season) || 0;
  const episode = Number(progress?.current_episode) || 0;
  if (!last || season < 1 || episode < 1) return null;
  const lastSeason = Number(last.season_number) || 0;
  const lastEpisode = Number(last.episode_number) || 0;
  if (lastSeason < 1 || lastEpisode < 1) return null;
  if (compareEpisode(season, episode, lastSeason, lastEpisode) > 0) return null;
  const aired = episodesBefore(details, lastSeason, lastEpisode) + 1;
  const watched = episodesBefore(details, season, episode);
  const left = showTimeLeft({ details, season, episode });
  return {
    tmdbId: Number(progress.tmdb_id),
    title: progress.title || details?.name || '',
    posterPath: progress.poster_path ?? details?.poster_path ?? null,
    season,
    episode,
    latest: season === lastSeason && episode === lastEpisode,
    progress: aired > 0 ? Math.min(1, Math.max(0, watched / aired)) : 0,
    episodesLeft: left.episodesLeft,
    minutesLeft: left.minutesLeft,
  };
}

/**
 * Continue watching for everything someone is watching, most recently touched
 * first.
 * @param {Array<{ tmdb_id: number, updated_at?: string }>} watching watching_progress rows
 * @param {Map<number, any> | Record<number, any>} detailsById TMDB TV details by id
 * @returns {ContinueItem[]}
 */
export function continueWatchingItems(watching, detailsById) {
  const get = (id) => detailsById instanceof Map ? detailsById.get(id) : detailsById?.[id];
  return [...(watching ?? [])]
    .sort((a, b) => String(b.updated_at ?? '').localeCompare(String(a.updated_at ?? '')))
    .map(w => continueItem(w, get(Number(w.tmdb_id))))
    .filter(/** @returns {item is ContinueItem} */ item => item !== null);
}
