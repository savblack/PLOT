// Episode list for a show the person is about to tick. Shared so web and
// mobile load seasons the same way. Rendering stays in each app.
import { useEffect, useState } from 'react';
import { tmdb } from './tmdb.js';

/**
 * @typedef {object} SeasonEpisode
 * @property {number} episode_number
 * @property {string} name
 */

/**
 * @typedef {object} TvSeasonBrowser
 * @property {number[] | null} seasons Numbered seasons, once details have loaded. Null while loading.
 * @property {number} season
 * @property {(season: number) => void} setSeason
 * @property {SeasonEpisode[] | null} episodes Null while that season is loading.
 * @property {boolean} failed
 * @property {boolean} loading
 */

/**
 * Seasons and episodes for one show. Pass null to load nothing.
 * A show with no season 1 (specials only were filtered out) opens on its
 * first numbered season without a setState in the effect.
 *
 * @param {number | null | undefined} tvId
 * @returns {TvSeasonBrowser}
 */
export function useTvSeasonBrowser(tvId) {
  const id = tvId == null ? null : Number(tvId);
  const [details, setDetails] = useState(/** @type {{ id: number, seasons: number[], failed: boolean } | null} */ (null));
  const [choice, setChoice] = useState(/** @type {{ id: number | null, season: number }} */ ({ id: null, season: 1 }));
  const [loaded, setLoaded] = useState(/** @type {{ id: number, season: number, episodes: SeasonEpisode[], failed: boolean } | null} */ (null));

  useEffect(() => {
    if (id == null || !Number.isInteger(id)) return undefined;
    let alive = true;
    tmdb.getTVDetails(id).then(data => {
      if (!alive) return;
      const seasons = (data?.seasons || [])
        .map(s => Number(s.season_number))
        .filter(n => Number.isInteger(n) && n > 0);
      setDetails({ id, seasons, failed: !data });
    }).catch(() => { if (alive) setDetails({ id, seasons: [], failed: true }); });
    return () => { alive = false; };
  }, [id]);

  const known = details?.id === id ? details : null;
  const seasonChoice = choice.id === id ? choice.season : 1;
  const season = known?.seasons.length && !known.seasons.includes(seasonChoice)
    ? known.seasons[0]
    : seasonChoice;

  useEffect(() => {
    if (id == null || !Number.isInteger(id)) return undefined;
    let alive = true;
    tmdb.getSeason(id, season).then(data => {
      if (!alive) return;
      const episodes = (data?.episodes || [])
        .map(ep => ({
          episode_number: Number(ep.episode_number),
          name: typeof ep.name === 'string' ? ep.name : '',
        }))
        .filter(ep => Number.isInteger(ep.episode_number) && ep.episode_number > 0);
      setLoaded({ id, season, episodes, failed: !data });
    }).catch(() => { if (alive) setLoaded({ id, season, episodes: [], failed: true }); });
    return () => { alive = false; };
  }, [id, season]);

  const ready = loaded?.id === id && loaded.season === season ? loaded : null;
  // A details failure still leaves the season request. Only say it failed
  // when the season itself failed, or details failed and the season never arrived.
  const failed = ready ? ready.failed : !!known?.failed;
  return {
    seasons: known ? known.seasons : null,
    season,
    setSeason: (next) => setChoice({ id, season: Number(next) }),
    episodes: ready ? ready.episodes : null,
    failed,
    loading: id != null && !ready && !failed,
  };
}
