import { useCallback, useEffect, useState } from 'react';
import { episodeRatingSeasonNumbers, loadTmdbEpisodeGrid, readPersonalEpisodeRatings } from './episodeRatings.js';
import { tmdb } from './tmdb.js';

const EMPTY = { grid: [], yours: {} };

/**
 * Audience scores for every numbered season, plus imported episode ratings.
 * Starts when the sheet opens.
 */
export function useEpisodeRatings({ tvId, details, userId, enabled }) {
  const seasonKey = episodeRatingSeasonNumbers(details).join(',');
  const [revision, setRevision] = useState(0);
  const key = `${tvId}:${userId || ''}:${seasonKey}:${revision}`;
  const [state, setState] = useState(null);
  const reload = useCallback(() => setRevision(value => value + 1), []);

  useEffect(() => {
    if (!enabled || !seasonKey) return undefined;
    let cancelled = false;
    const seasons = seasonKey.split(',').map(Number);
    Promise.all([
      loadTmdbEpisodeGrid(tvId, seasons, (id, season) => tmdb.getSeason(id, season)),
      userId ? readPersonalEpisodeRatings(userId, tvId) : Promise.resolve({}),
    ]).then(([grid, yours]) => {
      if (!cancelled) setState({ key, status: 'ready', grid, yours });
    }).catch(() => {
      if (!cancelled) setState({ key, status: 'error', ...EMPTY });
    });
    return () => { cancelled = true; };
  }, [enabled, key, seasonKey, tvId, userId]);

  if (!enabled) return { status: 'idle', ...EMPTY, reload };
  if (!seasonKey) return { status: 'ready', ...EMPTY, reload };
  if (state?.key !== key) return { status: 'loading', ...EMPTY, reload };
  return { status: state.status, grid: state.grid, yours: state.yours, reload };
}
