// Find an episode by its title across every season of a show (issue 1445). The
// episode guide loads one season at a time, so this loads the rest on demand,
// keeps them for as long as the guide is open, and matches titles in memory.
// Shared so web and mobile match the same way. Rendering stays in each app.
import { useEffect, useMemo, useRef, useState } from 'react';
import { FAILED_LOADS, reportLoadFailure } from './actionFailures.js';
import { getConfig } from './config.js';
import { getEpisodeGuideState } from './episodeProgress.js';
import { tmdb } from './tmdb.js';

/** Shorter queries match nearly every episode and are not worth the requests. */
export const EPISODE_SEARCH_MIN_QUERY = 2;
/** Enough to scroll through; past this the query wants another word. */
export const EPISODE_SEARCH_LIMIT = 50;
// The TMDB Worker allows 100 requests per 10 seconds per IP, shared with the
// rest of the app, and a cached season costs none. Two at a time, at least
// 150ms apart, caps this at under 7 a second so a 250-season show cannot
// starve the panel's other reads.
const SEASON_CONCURRENCY = 2;
const SEASON_SPACING_MS = 150;
const NO_SEASONS = Object.freeze({});

/**
 * @typedef {object} SearchableEpisode
 * @property {number} season_number
 * @property {number} episode_number
 * @property {string} name
 * @property {string | null} air_date
 */

/**
 * @typedef {SearchableEpisode & { isWatched: boolean }} EpisodeSearchResult
 */

/**
 * Lowercase, accents and punctuation removed, single spaces. "Café — Part 2"
 * and "cafe part 2" compare equal.
 *
 * @param {unknown} value
 * @returns {string}
 */
export function normalizeEpisodeText(value) {
  return String(value ?? '')
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim();
}

/**
 * The episodes in one TMDB season response, in the shape search needs.
 *
 * @param {number} seasonNumber
 * @param {any} data
 * @returns {SearchableEpisode[]}
 */
export function searchableEpisodes(seasonNumber, data) {
  return (data?.episodes || [])
    .map(ep => ({
      season_number: Number(seasonNumber),
      episode_number: Number(ep?.episode_number),
      name: typeof ep?.name === 'string' ? ep.name : '',
      air_date: typeof ep?.air_date === 'string' && ep.air_date ? ep.air_date : null,
    }))
    .filter(ep => Number.isInteger(ep.episode_number) && ep.episode_number > 0 && ep.name);
}

// Lower is better: the whole title, then a title that starts with the query,
// then every word starting a word in the title, then anywhere.
function matchScore(title, query, words) {
  if (title === query) return 0;
  if (title.startsWith(query)) return 1;
  const titleWords = title.split(' ');
  if (words.every(word => titleWords.some(t => t.startsWith(word)))) return 2;
  return 3;
}

// Specials sort after the numbered seasons, as they do in the season picker.
const seasonOrder = (season) => (season === 0 ? Number.MAX_SAFE_INTEGER : season);

/**
 * Episodes whose title holds every word of the query, in any order. Best
 * matches first, then by season and episode.
 *
 * @param {SearchableEpisode[]} episodes
 * @param {string} query
 * @param {{ limit?: number }} [opts]
 * @returns {SearchableEpisode[]}
 */
export function matchEpisodes(episodes, query, { limit = EPISODE_SEARCH_LIMIT } = {}) {
  const q = normalizeEpisodeText(query);
  if (q.length < EPISODE_SEARCH_MIN_QUERY) return [];
  const words = q.split(' ');
  const scored = [];
  for (const ep of episodes) {
    const title = normalizeEpisodeText(ep.name);
    if (!words.every(word => title.includes(word))) continue;
    scored.push({ ep, score: matchScore(title, q, words) });
  }
  scored.sort((a, b) => (a.score - b.score)
    || (seasonOrder(a.ep.season_number) - seasonOrder(b.ep.season_number))
    || (a.ep.episode_number - b.ep.episode_number));
  return scored.slice(0, limit).map(entry => entry.ep);
}

/**
 * Adds the same watched state the episode guide shows for each row.
 *
 * @param {SearchableEpisode[]} episodes
 * @param {{ currentSeason?: number, currentEpisode?: number, episodeStates?: Record<string, boolean> }} progress
 * @returns {EpisodeSearchResult[]}
 */
export function withEpisodeWatchState(episodes, { currentSeason = 0, currentEpisode = 0, episodeStates = {} } = {}) {
  return episodes.map(ep => ({
    ...ep,
    isWatched: getEpisodeGuideState({
      currentSeason,
      currentEpisode,
      selectedSeason: ep.season_number,
      episodeNumber: ep.episode_number,
      episodeStates,
    }).isWatched,
  }));
}

/**
 * Loads seasons a few at a time, spaced apart, until all are done or
 * `isCancelled()` turns true. A failed season is reported and skipped.
 *
 * @param {number[]} seasonNumbers
 * @param {object} opts
 * @param {(season: number) => Promise<any>} opts.fetchSeason
 * @param {(season: number, data: any) => void} opts.onSeason Called with null data on failure.
 * @param {() => boolean} [opts.isCancelled]
 * @param {number} [opts.concurrency]
 * @param {number} [opts.spacingMs]
 * @param {(ms: number) => Promise<void>} [opts.sleepFn] Test seam.
 * @returns {Promise<void>}
 */
export async function loadSeasonsPaced(seasonNumbers, {
  fetchSeason,
  onSeason,
  isCancelled = () => false,
  concurrency = SEASON_CONCURRENCY,
  spacingMs = SEASON_SPACING_MS,
  sleepFn = (ms) => new Promise(resolve => setTimeout(resolve, ms)),
}) {
  const queue = [...seasonNumbers];
  let nextStart = 0;
  const worker = async () => {
    while (queue.length && !isCancelled()) {
      const season = queue.shift();
      // Claim the next start slot before waiting, so workers never share one.
      const now = Date.now();
      const startAt = Math.max(now, nextStart);
      nextStart = startAt + spacingMs;
      if (startAt > now) await sleepFn(startAt - now);
      if (isCancelled()) return;
      let data;
      try { data = await fetchSeason(season); } catch { data = null; }
      if (isCancelled()) return;
      onSeason(season, data);
    }
  };
  await Promise.all(Array.from({ length: Math.max(1, concurrency) }, worker));
}

/**
 * @typedef {object} EpisodeSearch
 * @property {boolean} active True once the query is long enough to search.
 * @property {EpisodeSearchResult[]} results
 * @property {boolean} loading Seasons are still arriving; results may grow.
 * @property {number} searchedSeasons
 * @property {number} totalSeasons
 * @property {number} failedSeasons
 * @property {(result: EpisodeSearchResult, index: number) => void} reportOpened
 *   Call when the person opens a result, with its 0-based index in `results`.
 *   Fires the analytics event (position is reported 1-based, like Tonight).
 */

/**
 * Title search across every season of one show. Seasons load the first time
 * the query is long enough, are kept while the hook is mounted, and stop
 * loading if the query is cleared.
 *
 * @param {object} args
 * @param {number | null | undefined} args.tvId
 * @param {number[]} args.seasonNumbers Seasons to search, specials (0) included if wanted.
 * @param {string} args.query
 * @param {{ currentSeason?: number, currentEpisode?: number, episodeStates?: Record<string, boolean> }} [args.progress]
 * @returns {EpisodeSearch}
 */
export function useEpisodeSearch({ tvId, seasonNumbers, query, progress }) {
  const id = tvId == null ? null : Number(tvId);
  const active = normalizeEpisodeText(query).length >= EPISODE_SEARCH_MIN_QUERY;
  const seasonKey = (seasonNumbers || []).filter(n => Number.isInteger(n) && n >= 0).join(',');
  const [store, setStore] = useState(/** @type {{ id: number | null, seasons: Record<number, SearchableEpisode[] | null> }} */ ({ id: null, seasons: {} }));
  // What has been asked for and what has arrived, so a re-run after clearing
  // the query resumes rather than starting over. Reset when the show changes.
  const requested = useRef(/** @type {{ id: number | null, seasons: Set<number>, arrived: Set<number> }} */ ({ id: null, seasons: new Set(), arrived: new Set() }));

  useEffect(() => {
    if (!active || id == null || !Number.isInteger(id) || !seasonKey) return undefined;
    if (requested.current.id !== id) requested.current = { id, seasons: new Set(), arrived: new Set() };
    const record = requested.current;
    const wanted = seasonKey.split(',').map(Number).filter(n => !requested.current.seasons.has(n));
    if (!wanted.length) return undefined;
    let cancelled = false;
    let failures = 0;
    const started = new Set();
    loadSeasonsPaced(wanted, {
      fetchSeason: (season) => {
        started.add(season);
        record.seasons.add(season);
        return tmdb.getSeason(id, season);
      },
      onSeason: (season, data) => {
        record.arrived.add(season);
        if (!data) failures += 1;
        setStore(prev => {
          const base = prev.id === id ? prev.seasons : {};
          return { id, seasons: { ...base, [season]: data ? searchableEpisodes(season, data) : null } };
        });
      },
      isCancelled: () => cancelled,
    }).then(() => {
      // Once per search, not per season: a 250-season show behind a rate limit
      // would otherwise send hundreds of identical events.
      if (!cancelled && failures > 0) reportLoadFailure(FAILED_LOADS.EPISODE_SEARCH, null);
    });
    return () => {
      cancelled = true;
      // A season in flight when the query was cleared never reached the store.
      // Let the next search ask for it again.
      for (const season of started) {
        if (!record.arrived.has(season)) record.seasons.delete(season);
      }
    };
  }, [active, id, seasonKey]);

  const loadedSeasons = store.id === id ? store.seasons : NO_SEASONS;

  const seasonList = seasonKey ? seasonKey.split(',').map(Number) : [];
  const searched = seasonList.filter(n => n in loadedSeasons);
  const failedSeasons = searched.filter(n => loadedSeasons[n] === null).length;
  const currentSeason = progress?.currentSeason || 0;
  const currentEpisode = progress?.currentEpisode || 0;
  const episodeStates = progress?.episodeStates;

  const matched = useMemo(() => {
    if (!active) return [];
    const all = Object.values(loadedSeasons).flatMap(eps => eps || []);
    return matchEpisodes(all, query);
  }, [active, loadedSeasons, query]);

  const results = useMemo(
    () => withEpisodeWatchState(matched, { currentSeason, currentEpisode, episodeStates }),
    [matched, currentSeason, currentEpisode, episodeStates],
  );

  return {
    active,
    results,
    loading: active && searched.length < seasonList.length,
    searchedSeasons: searched.length,
    totalSeasons: seasonList.length,
    failedSeasons,
    reportOpened: (result, index) => {
      try {
        getConfig().onEpisodeSearch?.({
          tmdb_id: id,
          season: result.season_number,
          episode: result.episode_number,
          position: index + 1,
          result_count: results.length,
          query_length: normalizeEpisodeText(query).length,
          total_seasons: seasonList.length,
        });
      } catch { /* analytics is best-effort */ }
    },
  };
}
