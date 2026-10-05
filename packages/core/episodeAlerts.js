// The title panel's Episode alerts card: what the "next episode" line says.
// Pure, so web and mobile label it the same way.

import { EPISODE_ALERTS } from './copy/episodeAlerts.js';
import { weekdayDayMonth } from './date.js';

/**
 * The next episode line, from TMDB TV details, or null when nothing is dated.
 * Only today or later counts: TMDB can keep a past episode in
 * next_episode_to_air for a day or so after it airs.
 *
 * @param {{ next_episode_to_air?: { air_date?: string | null, season_number?: number, episode_number?: number } | null } | null | undefined} details
 * @param {string} todayStr local YYYY-MM-DD
 * @returns {{ date: string, when: string, label: string } | null}
 */
export function nextEpisodeLine(details, todayStr) {
  const next = details?.next_episode_to_air;
  const date = next?.air_date;
  if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date) || date < todayStr) return null;
  const season = next.season_number;
  const episode = next.episode_number;
  const label = episode === 1 && season ? EPISODE_ALERTS.seasonPremiere(season)
    : season && episode ? EPISODE_ALERTS.episode(season, episode)
      : '';
  return { date, when: weekdayDayMonth(date), label };
}
