import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { tmdb, excludeKidsContent } from './tmdb.js';
import { supabase } from './supabase.js';

// Tonight's movie picker (Premium). The viewer sets their options (time,
// genres, era, score, language, and whether to stay within their services
// and/or their watchlist), presses Go, and gets three options or one random
// pick. Nothing is fetched until Go, so browsing the options costs no TMDB
// calls.
//
// Two sources, chosen by the "only my watchlist" box:
//   - watchlist: each saved movie costs one details call (runtime is not
//     stored on list_items), cached for the session; the walk stops as soon
//     as the pool is big enough to draw from.
//   - discover: one /discover/movie page with every filter applied on TMDB's
//     side. Further pages are only fetched when "spin again" runs out.
// Availability is re-read live rather than trusted from list_items.provider_ids,
// which is a snapshot from save time and often empty.
//
// Entitlement is not checked here: the surface gates on Premium and never
// calls go() for Free viewers.

/** Runtime budgets, in minutes. `null` means any length. */
export const PICKER_RUNTIMES = [90, 120, 150, null];

const thisYear = () => new Date().getFullYear();

/**
 * Release eras. Dates map to TMDB's primary_release_date.gte / .lte.
 * @type {Array<{ id: string, gte?: () => string, lte?: () => string }>}
 */
export const PICKER_ERAS = [
  { id: 'any' },
  { id: 'recent', gte: () => `${thisYear() - 2}-01-01` },
  { id: '2010s', gte: () => '2010-01-01', lte: () => '2019-12-31' },
  { id: '2000s', gte: () => '2000-01-01', lte: () => '2009-12-31' },
  { id: '1990s', gte: () => '1990-01-01', lte: () => '1999-12-31' },
  { id: 'classic', lte: () => '1989-12-31' },
];

/** Minimum TMDB score (vote_average). `null` means any. */
export const PICKER_MIN_SCORES = [null, 6, 7, 8];

/** Original language (ISO 639-1, TMDB's with_original_language). `null` means any. */
export const PICKER_LANGUAGES = [null, 'en', 'fr', 'es', 'ko', 'ja', 'hi', 'it', 'de'];

/** How many titles each result mode shows. */
export const PICKER_MODES = { three: 3, random: 1 };

/** The spin always lasts at least this long, so it reads as a reveal, not a flicker. */
export const PICKER_MIN_SPIN_MS = 1400;

// Discover returns shorts and concert clips at the low end; anything under
// this is not "a movie for tonight".
const MIN_FEATURE_RUNTIME = 60;
// A high score on a handful of votes is noise; ask for more votes when a
// minimum score is set.
const MIN_VOTES = 20;
const MIN_VOTES_WITH_SCORE = 150;
// Caps the watchlist walk so a huge watchlist does not spend the proxy budget
// (100 requests / 10s / IP). Newest saves first.
const WATCHLIST_DETAIL_LIMIT = 40;
// Enough matches to draw a few different sets of three from.
const WATCHLIST_POOL_TARGET = 12;
const CONCURRENCY = 3;
const GAP_MS = 120;

/**
 * @typedef {Object} PickerOptions
 * @property {number|null} maxRuntime
 * @property {number[]} genreIds Any of these (TMDB genre ids from the genre catalog).
 * @property {string} era One of PICKER_ERAS ids.
 * @property {number|null} minScore
 * @property {string|null} language
 * @property {boolean} onlyServices Limit to the viewer's streaming services.
 * @property {boolean} onlyWatchlist Limit to the viewer's watchlist.
 */

/**
 * @typedef {Object} PickerCandidate
 * @property {number} id TMDB movie id (from a TMDB response, never guessed)
 * @property {'movie'} media_type
 * @property {string} title
 * @property {string|null} poster_path
 * @property {string|null} backdrop_path
 * @property {string|null} release_date
 * @property {number[]} genre_ids
 * @property {number|null} runtime Minutes. Null for discover results (TMDB filtered it server-side).
 * @property {number|null} vote_average
 * @property {Array<{id: number, name: string, logo_path: string|null}>} providers Matching services, when known.
 * @property {boolean} onWatchlist
 */

/** @returns {PickerOptions} */
export function defaultPickerOptions({ hasServices = false } = {}) {
  return {
    maxRuntime: 120,
    genreIds: [],
    era: 'any',
    minScore: null,
    language: null,
    onlyServices: hasServices,
    onlyWatchlist: false,
  };
}

/**
 * TMDB provider ids from `profile.streaming_providers`. Entries without a
 * numeric id (older rows, Storybook fixtures) are skipped.
 * @param {Array<{id?: number|string}>|null|undefined} streamingProviders
 * @returns {number[]}
 */
export function pickerProviderIds(streamingProviders) {
  return [...new Set((streamingProviders || [])
    .map(p => Number(p?.id))
    .filter(id => Number.isFinite(id) && id > 0))];
}

/**
 * Flatrate providers for a region from a details payload's `watch/providers`.
 * @param {any} details
 * @param {string} region
 * @returns {Array<{id: number, name: string, logo_path: string|null}>}
 */
export function regionFlatrate(details, region) {
  const flatrate = details?.['watch/providers']?.results?.[region]?.flatrate ?? [];
  return flatrate.map(p => ({ id: p.provider_id, name: p.provider_name, logo_path: p.logo_path ?? null }));
}

/** @param {string} eraId */
function eraRange(eraId) {
  const era = PICKER_ERAS.find(e => e.id === eraId) ?? PICKER_ERAS[0];
  return { gte: era.gte?.() ?? null, lte: era.lte?.() ?? null };
}

/**
 * TMDB /discover/movie params for a set of options.
 * @param {PickerOptions} options
 * @param {{ providerIds: number[], region: string, page?: number }} ctx
 */
export function discoverParams(options, { providerIds, region, page = 1 }) {
  const { gte, lte } = eraRange(options.era);
  /** @type {Record<string, string|number>} */
  const params = {
    sort_by: 'popularity.desc',
    'with_runtime.gte': MIN_FEATURE_RUNTIME,
    'vote_count.gte': options.minScore ? MIN_VOTES_WITH_SCORE : MIN_VOTES,
    page,
  };
  if (options.maxRuntime) params['with_runtime.lte'] = options.maxRuntime;
  // Pipe is OR in TMDB: any of the chosen genres.
  if (options.genreIds.length) params.with_genres = options.genreIds.join('|');
  if (gte) params['primary_release_date.gte'] = gte;
  if (lte) params['primary_release_date.lte'] = lte;
  if (options.minScore) params['vote_average.gte'] = options.minScore;
  if (options.language) params.with_original_language = options.language;
  if (options.onlyServices) {
    params.watch_region = region;
    params.with_watch_providers = providerIds.join('|');
    params.with_watch_monetization_types = 'flatrate';
  }
  return params;
}

/**
 * Whether a watchlist movie matches every option. Runtime must be known.
 * @param {{ runtime: number|null, genre_ids: number[], release_date: string|null, vote_average: number|null, original_language?: string|null, providers: Array<{id: number}> }} c
 * @param {PickerOptions} options
 * @param {number[]} providerIds
 */
export function matchesOptions(c, options, providerIds) {
  if (!c?.runtime || c.runtime < MIN_FEATURE_RUNTIME) return false;
  if (options.maxRuntime && c.runtime > options.maxRuntime) return false;
  if (options.genreIds.length && !options.genreIds.some(id => c.genre_ids.includes(id))) return false;
  const { gte, lte } = eraRange(options.era);
  if (gte && (!c.release_date || c.release_date < gte)) return false;
  if (lte && (!c.release_date || c.release_date > lte)) return false;
  if (options.minScore && (c.vote_average ?? 0) < options.minScore) return false;
  if (options.language && c.original_language !== options.language) return false;
  if (options.onlyServices) {
    const wanted = new Set(providerIds);
    if (!(c.providers || []).some(p => wanted.has(p.id))) return false;
  }
  return true;
}

/**
 * Draw `count` titles, preferring ones not shown yet so "spin again" always
 * changes the answer while there is anything new to show.
 * @template {{ id: number }} T
 * @param {T[]} pool
 * @param {number} count
 * @param {{ seen?: Set<number>, rng?: () => number }} [opts]
 * @returns {T[]}
 */
export function drawFromPool(pool, count, { seen = new Set(), rng = Math.random } = {}) {
  const shuffle = (list) => {
    const a = list.slice();
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(rng() * (i + 1));
      [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
  };
  const fresh = shuffle(pool.filter(c => !seen.has(c.id)));
  if (fresh.length >= count) return fresh.slice(0, count);
  const used = shuffle(pool.filter(c => seen.has(c.id)));
  return [...fresh, ...used].slice(0, count);
}

/** @type {Map<number, any>} */
const detailsCache = new Map();
/** Test seam. */
export const _resetPickerCache = () => detailsCache.clear();

const sleep = (ms) => new Promise(r => setTimeout(r, ms));

async function slimDetails(client, id) {
  if (detailsCache.has(id)) return detailsCache.get(id);
  try {
    const d = await client.getMovieDetails(id);
    if (!d) return null;
    const slim = {
      runtime: d.runtime ?? null,
      genre_ids: (d.genres || []).map(g => g.id),
      backdrop_path: d.backdrop_path ?? null,
      release_date: d.release_date ?? null,
      vote_average: d.vote_average ?? null,
      original_language: d.original_language ?? null,
      watchProviders: d['watch/providers'] ?? null,
    };
    detailsCache.set(id, slim);
    return slim;
  } catch {
    return null;
  }
}

/**
 * Watchlist movies that match the options, walking newest saves first and
 * stopping once `target` match.
 * @returns {Promise<{ pool: PickerCandidate[], exhausted: boolean }>}
 */
export async function loadWatchlistPool({
  watchlistItems, options, providerIds, region, excludeIds = new Set(),
  hideKids = false, client = tmdb, gapMs = GAP_MS, target = WATCHLIST_POOL_TARGET,
}) {
  const movies = (watchlistItems || [])
    .filter(i => (i.media_type || 'movie') === 'movie' && i.tmdb_id && !excludeIds.has(Number(i.tmdb_id)))
    .slice()
    .sort((a, b) => String(b.created_at || '').localeCompare(String(a.created_at || '')))
    .slice(0, WATCHLIST_DETAIL_LIMIT);

  const pool = [];
  let walked = 0;
  for (let i = 0; i < movies.length && pool.length < target; i += CONCURRENCY) {
    const batch = movies.slice(i, i + CONCURRENCY);
    const uncached = batch.filter(m => !detailsCache.has(Number(m.tmdb_id))).length;
    const slims = await Promise.all(batch.map(m => slimDetails(client, Number(m.tmdb_id))));
    walked = i + batch.length;
    batch.forEach((m, j) => {
      const s = slims[j];
      if (!s) return;
      const c = {
        id: Number(m.tmdb_id),
        media_type: /** @type {'movie'} */ ('movie'),
        title: m.title,
        poster_path: m.poster_path ?? null,
        backdrop_path: s.backdrop_path,
        release_date: s.release_date ?? m.release_date ?? null,
        genre_ids: s.genre_ids.length ? s.genre_ids : (m.genre_ids || []),
        runtime: s.runtime,
        vote_average: s.vote_average,
        original_language: s.original_language,
        providers: regionFlatrate({ 'watch/providers': s.watchProviders }, region)
          .filter(p => providerIds.includes(p.id)),
        onWatchlist: true,
      };
      if (matchesOptions(c, options, providerIds)) pool.push(c);
    });
    // Only pace real network calls; a cached batch costs nothing.
    if (gapMs && uncached && walked < movies.length && pool.length < target) await sleep(gapMs);
  }
  return { pool: excludeKidsContent(pool, hideKids), exhausted: walked >= movies.length };
}

/**
 * One discover page for the options, minus watched titles.
 * @returns {Promise<{ pool: PickerCandidate[], totalPages: number }>}
 */
export async function loadDiscoverPage({
  options, providerIds, region, page = 1, excludeIds = new Set(), savedIds = new Set(),
  hideKids = false, client = tmdb,
}) {
  const res = await client.discoverMovies(discoverParams(options, { providerIds, region, page })).catch(() => null);
  const pool = excludeKidsContent(res?.results ?? [], hideKids)
    .filter(r => r?.id && r.poster_path && !excludeIds.has(r.id))
    .map(r => ({
      id: r.id,
      media_type: /** @type {'movie'} */ ('movie'),
      title: r.title,
      poster_path: r.poster_path,
      backdrop_path: r.backdrop_path ?? null,
      release_date: r.release_date ?? null,
      genre_ids: r.genre_ids || [],
      runtime: null,
      vote_average: r.vote_average ?? null,
      providers: [],
      onWatchlist: savedIds.has(r.id),
    }));
  return { pool, totalPages: Math.min(res?.total_pages ?? 1, 500) };
}

/** Movie ids the viewer has already watched, so the picker does not suggest them. */
async function loadWatchedMovieIds(userId) {
  const { data } = await supabase
    .from('history')
    .select('tmdb_id')
    .eq('user_id', userId)
    .eq('media_type', 'movie');
  return new Set((data || []).map(r => Number(r.tmdb_id)));
}

/**
 * State for the picker panel. Nothing is fetched until go().
 * @param {{
 *   enabled: boolean,
 *   userId?: string|null,
 *   watchlistItems: any[],
 *   streamingProviders: any[]|null|undefined,
 *   region: string,
 *   hideKids?: boolean,
 * }} opts
 */
export function useTonightPicker({ enabled, userId, watchlistItems, streamingProviders, region, hideKids = false }) {
  const providerIds = useMemo(() => pickerProviderIds(streamingProviders), [streamingProviders]);
  const hasServices = providerIds.length > 0;
  const hasWatchlist = (watchlistItems || []).some(i => (i.media_type || 'movie') === 'movie');

  const [options, setOptions] = useState(() => defaultPickerOptions({ hasServices }));
  const [phase, setPhase] = useState(/** @type {'setup'|'spinning'|'results'|'empty'|'error'} */ ('setup'));
  const [mode, setMode] = useState(/** @type {'three'|'random'} */ ('three'));
  const [results, setResults] = useState(/** @type {PickerCandidate[]} */ ([]));
  const [genres, setGenres] = useState(/** @type {Array<{id: number, name: string}>} */ ([]));

  // The pool for the current options, plus what has been shown from it.
  const run = useRef({ key: '', pool: [], seen: new Set(), page: 1, totalPages: 1, target: WATCHLIST_POOL_TARGET, exhausted: false });
  const watched = useRef(/** @type {Set<number>|null} */ (null));

  // Services can load after the first render; default the box on once they do.
  const servicesDefaulted = useRef(hasServices);
  useEffect(() => {
    if (hasServices && !servicesDefaulted.current) {
      servicesDefaulted.current = true;
      // eslint-disable-next-line react-hooks/set-state-in-effect -- one-time default once the profile's services arrive
      setOptions(o => ({ ...o, onlyServices: true }));
    }
  }, [hasServices]);

  // Movie genres only (the combined list includes TV-only genres).
  useEffect(() => {
    if (!enabled) return;
    let alive = true;
    tmdb.getGenreCatalog()
      .then(c => { if (alive) setGenres(c?.movie ?? []); })
      .catch(() => {});
    return () => { alive = false; };
  }, [enabled]);

  const setOption = useCallback((key, value) => setOptions(o => ({ ...o, [key]: value })), []);
  const toggleGenre = useCallback((id) => setOptions(o => ({
    ...o,
    genreIds: o.genreIds.includes(id) ? o.genreIds.filter(g => g !== id) : [...o.genreIds, id],
  })), []);

  const draw = useCallback(async (nextMode) => {
    const count = PICKER_MODES[nextMode];
    const opts = { ...options, onlyServices: options.onlyServices && hasServices };
    const key = JSON.stringify([opts, region, hideKids]);
    const r = run.current;
    if (r.key !== key) {
      run.current = { key, pool: [], seen: new Set(), page: 0, totalPages: 1, target: 0, exhausted: false };
    }
    const cur = run.current;
    if (!watched.current) watched.current = userId ? await loadWatchedMovieIds(userId) : new Set();
    const excludeIds = watched.current;
    const unseen = () => cur.pool.filter(c => !cur.seen.has(c.id)).length;

    // Grow the pool only when there is not enough new to show.
    if (unseen() < count) {
      if (opts.onlyWatchlist) {
        if (!cur.exhausted) {
          cur.target += WATCHLIST_POOL_TARGET;
          const { pool, exhausted } = await loadWatchlistPool({
            watchlistItems, options: opts, providerIds, region, excludeIds, hideKids, target: cur.target,
          });
          cur.pool = pool;
          cur.exhausted = exhausted;
        }
      } else if (cur.page < cur.totalPages) {
        cur.page += 1;
        const savedIds = new Set((watchlistItems || []).map(i => Number(i.tmdb_id)));
        const { pool, totalPages } = await loadDiscoverPage({
          options: opts, providerIds, region, page: cur.page, excludeIds, savedIds, hideKids,
        });
        const have = new Set(cur.pool.map(c => c.id));
        cur.pool = [...cur.pool, ...pool.filter(c => !have.has(c.id))];
        cur.totalPages = totalPages;
      }
    }

    const picked = drawFromPool(cur.pool, count, { seen: cur.seen });
    picked.forEach(c => cur.seen.add(c.id));
    return picked;
  }, [options, hasServices, region, hideKids, userId, watchlistItems, providerIds]);

  const go = useCallback(async (nextMode = 'three') => {
    if (!enabled) return;
    setMode(nextMode);
    setPhase('spinning');
    const started = Date.now();
    let picked = [];
    let failed = false;
    try {
      picked = await draw(nextMode);
    } catch {
      failed = true;
    }
    const wait = PICKER_MIN_SPIN_MS - (Date.now() - started);
    if (wait > 0) await sleep(wait);
    setResults(picked);
    setPhase(failed ? 'error' : picked.length ? 'results' : 'empty');
  }, [enabled, draw]);

  const spinAgain = useCallback(() => go(mode), [go, mode]);
  const backToOptions = useCallback(() => setPhase('setup'), []);

  return {
    options, setOption, toggleGenre, genres,
    hasServices, hasWatchlist,
    phase, mode, results,
    go, spinAgain, backToOptions,
  };
}
