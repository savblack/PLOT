// Remaining runtime for a show, and the clock time a title finishes if you
// start it now. Free on both apps. Season 0 never counts, same as
// continueWatching.js. A missing episode runtime uses the show's average,
// the same fallback tonightPicker.js uses when TMDB's episode_run_time is empty.

import { formatDuration } from './historyStats.js';
import { MEDIA_PANEL } from './copy/mediaPanel.js';

/** @param {any} details TMDB TV details */
export function fallbackEpisodeRuntime(details) {
  const runtime = details?.episode_run_time?.[0]
    ?? details?.last_episode_to_air?.runtime
    ?? details?.next_episode_to_air?.runtime
    ?? null;
  return runtime > 0 ? runtime : null;
}

function seasonCounts(details) {
  /** @type {Map<number, number>} */
  const counts = new Map();
  for (const season of details?.seasons ?? []) {
    const number = Number(season?.season_number);
    const count = Number(season?.episode_count) || 0;
    if (number >= 1 && count > 0) counts.set(number, count);
  }
  return counts;
}

function compareEpisode(seasonA, episodeA, seasonB, episodeB) {
  return seasonA !== seasonB ? seasonA - seasonB : episodeA - episodeB;
}

/**
 * Aired episodes from the next-to-watch pointer through the last episode
 * that has aired, inclusive. Nothing unaired is included.
 * @param {any} details
 * @param {number} season
 * @param {number} episode
 * @returns {{ season: number, episode: number }[]}
 */
export function remainingAiredEpisodes(details, season, episode) {
  const last = details?.last_episode_to_air;
  const endSeason = Number(last?.season_number) || 0;
  const endEpisode = Number(last?.episode_number) || 0;
  const startSeason = Number(season) || 0;
  const startEpisode = Number(episode) || 0;
  if (endSeason < 1 || endEpisode < 1 || startSeason < 1 || startEpisode < 1) return [];
  if (compareEpisode(startSeason, startEpisode, endSeason, endEpisode) > 0) return [];

  const counts = seasonCounts(details);
  const seasons = [...counts.keys()].filter(number => number >= startSeason && number <= endSeason);
  if (!counts.has(endSeason)) seasons.push(endSeason);
  seasons.sort((a, b) => a - b);

  /** @type {{ season: number, episode: number }[]} */
  const remaining = [];
  for (const number of seasons) {
    const from = number === startSeason ? startEpisode : 1;
    const listed = counts.get(number) ?? endEpisode;
    const to = number === endSeason ? Math.min(endEpisode, listed) : listed;
    for (let cursor = from; cursor <= to; cursor += 1) {
      remaining.push({ season: number, episode: cursor });
    }
  }
  return remaining;
}

/**
 * @param {{ details?: any, season?: number, episode?: number, knownEpisodes?: any[] }} [input]
 * @returns {{ episodesLeft: number, minutesLeft: number | null, missingRuntimes: number }}
 */
export function showTimeLeft({ details, season, episode, knownEpisodes = [] } = {}) {
  const remaining = remainingAiredEpisodes(details, season, episode);
  /** @type {Map<string, number>} */
  const known = new Map();
  for (const item of knownEpisodes) {
    const itemSeason = Number(item?.season_number ?? item?.season);
    const itemEpisode = Number(item?.episode_number ?? item?.episode);
    const runtime = Number(item?.runtime);
    if (itemSeason >= 1 && itemEpisode >= 1 && runtime > 0) {
      known.set(`${itemSeason}:${itemEpisode}`, runtime);
    }
  }
  const fallback = fallbackEpisodeRuntime(details);
  let minutes = 0;
  let missing = 0;
  for (const item of remaining) {
    const runtime = known.get(`${item.season}:${item.episode}`);
    if (runtime > 0) minutes += runtime;
    else if (fallback > 0) minutes += fallback;
    else missing += 1;
  }
  return {
    episodesLeft: remaining.length,
    minutesLeft: remaining.length > 0 && missing === 0 ? minutes : null,
    missingRuntimes: missing,
  };
}

/**
 * @param {{ episodesLeft?: number, minutesLeft?: number | null }} left
 * @returns {string}
 */
export function timeLeftCaption(left) {
  if (!left?.episodesLeft) return '';
  if (left.minutesLeft > 0) return MEDIA_PANEL.episodesAndTimeLeft(left.episodesLeft, formatDuration(left.minutesLeft));
  return MEDIA_PANEL.episodesLeft(left.episodesLeft);
}

/**
 * Local clock time a runtime finishes, or null when there is nothing to add.
 * `timeZone` is for tests. Callers omit it so the device zone is used.
 * @param {number} runtimeMinutes
 * @param {Date} [now]
 * @param {{ locales?: Intl.LocalesArgument, timeZone?: string }} [options]
 * @returns {string | null}
 */
export function endsAtTime(runtimeMinutes, now = new Date(), { locales, timeZone } = {}) {
  const minutes = Number(runtimeMinutes);
  if (!(minutes > 0) || !(now instanceof Date) || Number.isNaN(now.getTime())) return null;
  const end = new Date(now.getTime() + minutes * 60_000);
  const format = { hour: 'numeric', minute: '2-digit' };
  if (timeZone) format.timeZone = timeZone;
  return new Intl.DateTimeFormat(locales, format).format(end);
}
