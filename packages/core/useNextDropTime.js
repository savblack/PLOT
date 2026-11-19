import { useEffect, useState } from 'react';
import { exactDropFor, fetchEpisodeAirings } from './dropTimes.js';

/**
 * The exact drop instant of a show's next episode, from TMDB TV details, or
 * null when there is none (no next episode, a streaming show, or no stored
 * time). Never blocks the card: it renders the day first and gains the time.
 *
 * @param {{ id?: number, next_episode_to_air?: { season_number?: number, episode_number?: number, air_date?: string | null } | null } | null | undefined} details
 * @returns {string | null}
 */
export function useNextDropTime(details) {
  const tmdbId = details?.id;
  const next = details?.next_episode_to_air;
  const key = tmdbId && next ? `${tmdbId}:${next.season_number}:${next.episode_number}:${next.air_date}` : null;
  const [state, setState] = useState(/** @type {{ key: string | null, at: string | null }} */ ({ key: null, at: null }));

  useEffect(() => {
    if (!key) return undefined;
    let active = true;
    fetchEpisodeAirings([tmdbId]).then(airings => {
      if (active) setState({ key, at: exactDropFor(airings, tmdbId, next) });
    });
    return () => { active = false; };
    // `next` is captured through `key`, which changes whenever it does.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, tmdbId]);

  return state.key === key ? state.at : null;
}
