import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { tmdb, excludeKidsContent, KIDS_GENRE_IDS } from './tmdb.js';
import { supabase } from './supabase.js';
import { TONIGHT_PICKER, GENRE_MOODS } from './copy/tonightPicker.js';

// Pick a Plot, the tonight picker (Premium). The viewer picks movie or TV first, then the
// options for that type (movie length, or TV format and episode length),
// genres, era, score, language, and whether to stay within their services,
// their watchlist, and away from kids and family titles. Go gives three
// options; Random select gives one. Nothing is fetched until Go, so browsing
// the options costs no TMDB calls.
//
// Two sources, chosen by the "only my watchlist" box:
//   - watchlist: each saved title costs one details call (runtime and season
//     count are not stored on list_items), cached for the session; the walk
//     stops as soon as the pool is big enough to draw from.
//   - discover: one /discover/{movie,tv} page with every filter TMDB supports
//     applied on its side. TV season count is not a discover filter, so the
//     "1 season" / "multiple seasons" formats check details for a capped
//     number of results. Further pages load only when "spin again" runs out.
// Availability is re-read live rather than trusted from list_items.provider_ids,
// which is a snapshot from save time and often empty.
//
// Entitlement is not checked here: the surface gates on Premium and never
// calls go() for Free viewers.

export const PICKER_MEDIA_TYPES = ['movie', 'tv'];

/** Movie length budgets, in minutes. `null` means any length. */
export const PICKER_RUNTIMES = [90, 120, 150, null];

/** TV formats. Mini-series maps to TMDB's show type; season counts need details. */
export const PICKER_TV_FORMATS = ['any', 'miniseries', 'oneSeason', 'multiSeason'];

/** Average episode length budgets for TV, in minutes. `null` means any. */
export const PICKER_EPISODE_RUNTIMES = [30, 45, 60, null];

const thisYear = () => new Date().getFullYear();

/**
 * Release eras. Movies use primary_release_date, TV uses first_air_date.
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

/** How many titles each result mode shows: Go aims for five, Surprise me shows one. */
export const PICKER_MODES = { five: 5, surprise: 1 };

/** Questions, in order. Go and Surprise me work from any of them. */
export const PICKER_STEPS = ['type', 'length', 'kind', 'quality'];

/** Genres shown before "Show all": the ones people reach for first. */
const FEATURED_GENRES = {
  movie: [35, 53, 18, 28, 27, 10749, 80, 878, 99, 16],
  tv: [35, 18, 80, 10759, 10765, 9648, 99, 16, 10768, 37],
};
export const FEATURED_GENRE_COUNT = 10;

/** The spin always lasts at least this long, so it reads as a reveal, not a flicker. */
export const PICKER_MIN_SPIN_MS = 1400;

// Discover returns shorts and concert clips at the low end; anything under
// this is not "a movie for tonight".
const MIN_FEATURE_RUNTIME = 60;
// Five-minute webisodes and clip shows are not an episode to settle in with.
const MIN_EPISODE_RUNTIME = 15;
// A high score on a handful of votes is noise; ask for more votes when a
// minimum score is set. TV needs a higher floor (long-running daily shows).
const MIN_VOTES = { movie: 20, tv: 50 };
const MIN_VOTES_WITH_SCORE = { movie: 150, tv: 100 };
// TMDB show types: 0 Documentary, 2 Miniseries, 4 Scripted. Leaves out news,
// reality, talk and video, which are not what "something to watch tonight" means.
const TV_TYPES_ANY = '0|2|4';
const TV_TYPE_MINISERIES = '2';
// News, talk and soap genres, same exclusions discoverByProviders uses for TV.
const TV_EXCLUDED_GENRES = [10763, 10767, 10766];
// Caps the watchlist walk so a huge watchlist does not spend the proxy budget
// (100 requests / 10s / IP). Newest saves first.
const WATCHLIST_DETAIL_LIMIT = 40;
// Enough matches to draw a few different sets of five from.
const POOL_TARGET = 15;
// Most discover results checked for season count per page.
const SEASON_CHECK_LIMIT = 12;
// How many extra pages one Go may fetch to fill all three slots before it
// settles for fewer. Tight filter combinations thin each page out.
const MAX_FETCHES_PER_DRAW = 5;
const CONCURRENCY = 3;
const GAP_MS = 120;

/**
 * @typedef {Object} PickerOptions
 * @property {'movie'|'tv'} mediaType
 * @property {number|null} maxRuntime Movie length.
 * @property {'any'|'miniseries'|'oneSeason'|'multiSeason'} tvFormat
 * @property {number|null} maxEpisodeRuntime TV average episode length.
 * @property {number[]} genreIds Any of these (TMDB genre ids from the genre catalog).
 * @property {string} era One of PICKER_ERAS ids.
 * @property {number|null} minScore
 * @property {string|null} language
 * @property {boolean} onlyServices Limit to the viewer's streaming services.
 * @property {boolean} onlyWatchlist Limit to the viewer's watchlist.
 * @property {boolean} hideKids Leave out kids and family titles.
 */

/**
 * @typedef {Object} PickerCandidate
 * @property {number} id TMDB id (from a TMDB response, never guessed)
 * @property {'movie'|'tv'} media_type
 * @property {string} title
 * @property {string|null} poster_path
 * @property {string|null} backdrop_path
 * @property {string|null} release_date First release (movie) or first air date (TV).
 * @property {number[]} genre_ids
 * @property {number|null} runtime Movie runtime or average episode length, when known.
 * @property {number|null} seasons TV season count, when known.
 * @property {boolean} miniseries TV only.
 * @property {number|null} vote_average
 * @property {Array<{id: number, name: string, logo_path: string|null}>} providers Matching services, when known.
 * @property {boolean} onWatchlist
 */

/** @returns {PickerOptions} */
export function defaultPickerOptions({ hasServices = false } = {}) {
  return {
    mediaType: 'movie',
    maxRuntime: null,
    tvFormat: 'any',
    maxEpisodeRuntime: null,
    genreIds: [],
    era: 'any',
    minScore: null,
    language: null,
    onlyServices: hasServices,
    onlyWatchlist: false,
    hideKids: true,
  };
}

/**
 * Genres to offer for a type: that type's catalog, minus kids/family when
 * those are being left out (picking a genre the filter then drops is a trap).
 * @param {{ movie?: Array<{id:number,name:string}>, tv?: Array<{id:number,name:string}> }} catalog
 * @param {PickerOptions} options
 */
export function pickerGenres(catalog, options) {
  const list = catalog?.[options.mediaType] ?? [];
  const featured = FEATURED_GENRES[options.mediaType] ?? [];
  const rank = (id) => { const i = featured.indexOf(id); return i === -1 ? featured.length : i; };
  return list
    .filter(g => !(options.mediaType === 'tv' && TV_EXCLUDED_GENRES.includes(g.id))
      && !(options.hideKids && KIDS_GENRE_IDS.has(g.id)))
    .map(g => ({ ...g, mood: GENRE_MOODS[g.id] ?? null }))
    .sort((a, b) => rank(a.id) - rank(b.id) || a.name.localeCompare(b.name));
}

/**
 * Which results heading applies: 3:30pm to midnight local is night.
 * @param {Date} [now]
 * @returns {'night'|'day'}
 */
export function pickerTimeOfDay(now = new Date()) {
  const minutes = now.getHours() * 60 + now.getMinutes();
  return minutes >= 15 * 60 + 30 ? 'night' : 'day';
}

/**
 * The sentence under the questions, as parts. `filled` parts are answers;
 * `placeholder` parts are unanswered questions shown greyed out.
 * @param {PickerOptions} options
 * @param {{ genres?: Array<{id: number, name: string, mood?: string|null}>, hasServices?: boolean }} [ctx]
 * @returns {Array<{ text: string, kind: 'plain'|'filled'|'placeholder' }>}
 */
export function pickerSentence(options, { genres = [], hasServices = false } = {}) {
  const S = TONIGHT_PICKER.sentence;
  const parts = [{ text: S.start, kind: 'plain' }];
  const tv = options.mediaType === 'tv';
  parts.push({ text: tv ? (S.tvFormat[options.tvFormat] ?? S.type.tv) : S.type.movie, kind: 'filled' });
  if (tv) {
    parts.push(options.maxEpisodeRuntime
      ? { text: `${S.episodes(options.maxEpisodeRuntime)},`, kind: 'filled' }
      : { text: `${S.anyLength},`, kind: 'placeholder' });
  } else {
    parts.push(options.maxRuntime
      ? { text: `${S.runtime(options.maxRuntime)},`, kind: 'filled' }
      : { text: `${S.anyLength},`, kind: 'placeholder' });
  }
  const moods = options.genreIds
    .map(id => genres.find(g => g.id === id))
    .filter(Boolean)
    .map(g => (g.mood || g.name).toLowerCase());
  const kind = moods.length > 2 ? `${moods.slice(0, -1).join(', ')} ${S.or} ${moods.at(-1)}` : moods.join(` ${S.or} `);
  parts.push(kind ? { text: `${kind},`, kind: 'filled' } : { text: `${S.anyKind},`, kind: 'placeholder' });
  if (options.era !== 'any' && S.era[options.era]) parts.push({ text: `${S.era[options.era]},`, kind: 'filled' });
  if (options.minScore) parts.push({ text: `${S.rated(options.minScore)},`, kind: 'filled' });
  if (options.language) parts.push({ text: `${S.inLanguage(TONIGHT_PICKER.languages[options.language])},`, kind: 'filled' });
  if (options.onlyWatchlist) parts.push({ text: `${S.fromWatchlist},`, kind: 'filled' });
  if (options.onlyServices && hasServices) parts.push({ text: S.onServices, kind: 'filled' });
  // Close the sentence: drop a trailing comma, end with a full stop.
  const last = parts[parts.length - 1];
  last.text = `${last.text.replace(/,$/, '')}.`;
  return parts;
}

/**
 * Short filters summary for the collapsed Filters row.
 * @param {PickerOptions} options
 * @param {{ hasServices?: boolean }} [ctx]
 */
export function pickerFiltersSummary(options, { hasServices = false } = {}) {
  const T = TONIGHT_PICKER;
  const parts = [];
  if (options.onlyServices && hasServices) parts.push(T.summary.services);
  if (options.onlyWatchlist) parts.push(T.summary.watchlist);
  if (options.hideKids) parts.push(T.summary.noKids);
  if (options.language) parts.push(T.languages[options.language]);
  return parts.length ? parts.join(' · ') : T.filtersNone;
}

/**
 * One-line answer per question, for the desktop Questions card.
 * @param {PickerOptions} options
 * @param {{ genres?: Array<{id: number, name: string}> }} [ctx]
 */
export function pickerAnswers(options, { genres = [] } = {}) {
  const T = TONIGHT_PICKER;
  const tv = options.mediaType === 'tv';
  const length = tv
    ? [options.tvFormat !== 'any' ? T.tvFormats[options.tvFormat] : null, options.maxEpisodeRuntime ? T.episodeRuntime(options.maxEpisodeRuntime) : null].filter(Boolean).join(', ')
    : (options.maxRuntime ? T.runtimes(options.maxRuntime) : '');
  const kind = options.genreIds.map(id => genres.find(g => g.id === id)?.name).filter(Boolean).join(', ');
  const quality = [options.era !== 'any' ? T.eras[options.era] : null, options.minScore ? T.score(options.minScore) : null].filter(Boolean).join(', ');
  return {
    type: T.mediaTypes[options.mediaType].label,
    length: length || T.anyAnswer,
    kind: kind || T.anyAnswer,
    quality: quality || T.anyAnswer,
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

/** Whether the TV format can only be checked against details (season count). */
export const formatNeedsDetails = (options) =>
  options.mediaType === 'tv' && (options.tvFormat === 'oneSeason' || options.tvFormat === 'multiSeason');

/**
 * TMDB /discover/{movie,tv} params for a set of options.
 * @param {PickerOptions} options
 * @param {{ providerIds: number[], region: string, page?: number }} ctx
 */
export function discoverParams(options, { providerIds, region, page = 1 }) {
  const tv = options.mediaType === 'tv';
  const { gte, lte } = eraRange(options.era);
  const dateKey = tv ? 'first_air_date' : 'primary_release_date';
  const without = [...(tv ? TV_EXCLUDED_GENRES : []), ...(options.hideKids ? KIDS_GENRE_IDS : [])];
  /** @type {Record<string, string|number>} */
  const params = {
    sort_by: 'popularity.desc',
    'vote_count.gte': options.minScore ? MIN_VOTES_WITH_SCORE[options.mediaType] : MIN_VOTES[options.mediaType],
    page,
  };
  if (tv) {
    params['with_runtime.gte'] = MIN_EPISODE_RUNTIME;
    if (options.maxEpisodeRuntime) params['with_runtime.lte'] = options.maxEpisodeRuntime;
    params.with_type = options.tvFormat === 'miniseries' ? TV_TYPE_MINISERIES : TV_TYPES_ANY;
  } else {
    params['with_runtime.gte'] = MIN_FEATURE_RUNTIME;
    if (options.maxRuntime) params['with_runtime.lte'] = options.maxRuntime;
  }
  // Pipe is OR in TMDB: any of the chosen genres. without_genres is comma (none of).
  if (options.genreIds.length) params.with_genres = options.genreIds.join('|');
  if (without.length) params.without_genres = [...new Set(without)].join(',');
  if (gte) params[`${dateKey}.gte`] = gte;
  if (lte) params[`${dateKey}.lte`] = lte;
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
 * Whether a title with known details matches every option.
 * @param {PickerCandidate & { original_language?: string|null }} c
 * @param {PickerOptions} options
 * @param {number[]} providerIds
 * @param {{ checkServices?: boolean }} [opts] Discover results already matched services on TMDB's side.
 */
export function matchesOptions(c, options, providerIds, { checkServices = true } = {}) {
  if (options.mediaType === 'tv') {
    if (c.runtime != null && c.runtime < MIN_EPISODE_RUNTIME) return false;
    if (options.maxEpisodeRuntime && (c.runtime == null || c.runtime > options.maxEpisodeRuntime)) return false;
    if (options.tvFormat === 'miniseries' && !c.miniseries) return false;
    if (options.tvFormat === 'oneSeason' && c.seasons !== 1) return false;
    if (options.tvFormat === 'multiSeason' && !(c.seasons >= 2)) return false;
  } else {
    if (!c?.runtime || c.runtime < MIN_FEATURE_RUNTIME) return false;
    if (options.maxRuntime && c.runtime > options.maxRuntime) return false;
  }
  if (options.hideKids && c.genre_ids.some(id => KIDS_GENRE_IDS.has(id))) return false;
  if (options.genreIds.length && !options.genreIds.some(id => c.genre_ids.includes(id))) return false;
  const { gte, lte } = eraRange(options.era);
  if (gte && (!c.release_date || c.release_date < gte)) return false;
  if (lte && (!c.release_date || c.release_date > lte)) return false;
  if (options.minScore && (c.vote_average ?? 0) < options.minScore) return false;
  if (options.language && c.original_language && c.original_language !== options.language) return false;
  if (checkServices && options.onlyServices) {
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

/** @type {Map<string, any>} keyed `${type}:${id}` */
const detailsCache = new Map();
/** Test seam. */
export const _resetPickerCache = () => detailsCache.clear();

const sleep = (ms) => new Promise(r => setTimeout(r, ms));

/** TV episode length: TMDB's episode_run_time is often empty now, so fall back to recent episodes. */
const tvEpisodeRuntime = (d) =>
  d.episode_run_time?.[0] ?? d.last_episode_to_air?.runtime ?? d.next_episode_to_air?.runtime ?? null;

async function slimDetails(client, type, id) {
  const key = `${type}:${id}`;
  if (detailsCache.has(key)) return detailsCache.get(key);
  try {
    const d = type === 'tv' ? await client.getTVDetails(id) : await client.getMovieDetails(id);
    if (!d) return null;
    const slim = {
      runtime: type === 'tv' ? tvEpisodeRuntime(d) : (d.runtime ?? null),
      seasons: type === 'tv' ? (d.number_of_seasons ?? null) : null,
      miniseries: type === 'tv' && d.type === 'Miniseries',
      genre_ids: (d.genres || []).map(g => g.id),
      backdrop_path: d.backdrop_path ?? null,
      release_date: (type === 'tv' ? d.first_air_date : d.release_date) ?? null,
      vote_average: d.vote_average ?? null,
      original_language: d.original_language ?? null,
      watchProviders: d['watch/providers'] ?? null,
    };
    detailsCache.set(key, slim);
    return slim;
  } catch {
    return null;
  }
}

/** Fetch details for `items` a few at a time, pacing only real network calls. */
async function walkDetails(client, type, items, { gapMs, until }) {
  const out = [];
  for (let i = 0; i < items.length && !until(out); i += CONCURRENCY) {
    const batch = items.slice(i, i + CONCURRENCY);
    const uncached = batch.filter(m => !detailsCache.has(`${type}:${m.id}`)).length;
    const slims = await Promise.all(batch.map(m => slimDetails(client, type, m.id)));
    batch.forEach((m, j) => out.push({ item: m, slim: slims[j] }));
    if (gapMs && uncached && i + CONCURRENCY < items.length && !until(out)) await sleep(gapMs);
  }
  return out;
}

/**
 * Watchlist titles of the chosen type that match the options, newest saves
 * first, stopping once `target` match.
 * @returns {Promise<{ pool: PickerCandidate[], exhausted: boolean }>}
 */
export async function loadWatchlistPool({
  watchlistItems, options, providerIds, region, excludeIds = new Set(),
  client = tmdb, gapMs = GAP_MS, target = POOL_TARGET,
}) {
  const type = options.mediaType;
  const saved = (watchlistItems || [])
    .filter(i => (i.media_type || 'movie') === type && i.tmdb_id && !excludeIds.has(Number(i.tmdb_id)))
    .slice()
    .sort((a, b) => String(b.created_at || '').localeCompare(String(a.created_at || '')))
    .slice(0, WATCHLIST_DETAIL_LIMIT)
    .map(i => ({ ...i, id: Number(i.tmdb_id) }));

  const pool = [];
  const walked = await walkDetails(client, type, saved, {
    gapMs,
    until: (done) => {
      // Re-derive the match count as the walk grows; cheap for 40 rows.
      pool.length = 0;
      for (const { item, slim } of done) {
        if (!slim) continue;
        const c = {
          id: item.id,
          media_type: type,
          title: item.title,
          poster_path: item.poster_path ?? null,
          backdrop_path: slim.backdrop_path,
          release_date: slim.release_date ?? item.release_date ?? null,
          genre_ids: slim.genre_ids.length ? slim.genre_ids : (item.genre_ids || []),
          runtime: slim.runtime,
          seasons: slim.seasons,
          miniseries: slim.miniseries,
          vote_average: slim.vote_average,
          original_language: slim.original_language,
          providers: regionFlatrate({ 'watch/providers': slim.watchProviders }, region)
            .filter(p => providerIds.includes(p.id)),
          onWatchlist: true,
        };
        if (matchesOptions(c, options, providerIds)) pool.push(c);
      }
      return pool.length >= target;
    },
  });
  return { pool: pool.slice(), exhausted: walked.length >= saved.length };
}

/**
 * One discover page for the options, minus watched titles. For season-count
 * formats, checks details for up to SEASON_CHECK_LIMIT results.
 * @returns {Promise<{ pool: PickerCandidate[], totalPages: number }>}
 */
export async function loadDiscoverPage({
  options, providerIds, region, page = 1, excludeIds = new Set(), savedIds = new Set(),
  client = tmdb, gapMs = GAP_MS,
}) {
  const type = options.mediaType;
  const fetchPage = type === 'tv' ? client.discoverTV : client.discoverMovies;
  const res = await fetchPage(discoverParams(options, { providerIds, region, page })).catch(() => null);
  let pool = excludeKidsContent(res?.results ?? [], options.hideKids)
    .filter(r => r?.id && r.poster_path && !excludeIds.has(r.id))
    .map(r => ({
      id: r.id,
      media_type: type,
      title: r.title ?? r.name,
      poster_path: r.poster_path,
      backdrop_path: r.backdrop_path ?? null,
      release_date: (type === 'tv' ? r.first_air_date : r.release_date) ?? null,
      genre_ids: r.genre_ids || [],
      runtime: null,
      seasons: null,
      miniseries: type === 'tv' && options.tvFormat === 'miniseries',
      vote_average: r.vote_average ?? null,
      providers: [],
      onWatchlist: savedIds.has(r.id),
    }));

  if (formatNeedsDetails(options)) {
    const checked = await walkDetails(client, type, pool.slice(0, SEASON_CHECK_LIMIT), {
      gapMs,
      until: (done) => done.filter(d => d.slim && matchesOptions(
        { ...d.item, seasons: d.slim.seasons, runtime: d.slim.runtime ?? d.item.runtime }, options, providerIds, { checkServices: false },
      )).length >= POOL_TARGET,
    });
    pool = checked
      .filter(d => d.slim)
      .map(d => ({ ...d.item, seasons: d.slim.seasons, runtime: d.slim.runtime, miniseries: d.slim.miniseries }))
      .filter(c => matchesOptions(c, options, providerIds, { checkServices: false }));
  }
  return { pool, totalPages: Math.min(res?.total_pages ?? 1, 500) };
}

/** Title ids the viewer has already watched, per type, so the picker does not suggest them. */
async function loadWatchedIds(userId) {
  const { data } = await supabase
    .from('history')
    .select('tmdb_id, media_type')
    .eq('user_id', userId);
  const out = { movie: new Set(), tv: new Set() };
  for (const r of data || []) (r.media_type === 'tv' ? out.tv : out.movie).add(Number(r.tmdb_id));
  return out;
}

/**
 * State for the picker panel. Nothing is fetched until go().
 * @param {{
 *   enabled: boolean,
 *   userId?: string|null,
 *   watchlistItems: any[],
 *   streamingProviders: any[]|null|undefined,
 *   region: string,
 * }} opts
 */
export function useTonightPicker({ enabled, userId, watchlistItems, streamingProviders, region }) {
  const providerIds = useMemo(() => pickerProviderIds(streamingProviders), [streamingProviders]);
  const hasServices = providerIds.length > 0;

  const [options, setOptions] = useState(() => defaultPickerOptions({ hasServices }));
  const [phase, setPhase] = useState(/** @type {'setup'|'spinning'|'results'|'empty'|'error'} */ ('setup'));
  const [mode, setMode] = useState(/** @type {'five'|'surprise'} */ ('five'));
  const [step, setStep] = useState(0);
  const [results, setResults] = useState(/** @type {PickerCandidate[]} */ ([]));
  const [canSpinAgain, setCanSpinAgain] = useState(false);
  const [catalog, setCatalog] = useState(/** @type {{ movie: any[], tv: any[] }} */ ({ movie: [], tv: [] }));

  const hasWatchlist = (watchlistItems || []).some(i => (i.media_type || 'movie') === options.mediaType);

  // The pool for the current options, plus what has been shown from it.
  const run = useRef({ key: '', pool: [], seen: new Set(), page: 0, totalPages: 1, target: 0, exhausted: false });
  const watched = useRef(/** @type {{ movie: Set<number>, tv: Set<number> }|null} */ (null));

  // Services can load after the first render; default the box on once they do.
  const servicesDefaulted = useRef(hasServices);
  useEffect(() => {
    if (hasServices && !servicesDefaulted.current) {
      servicesDefaulted.current = true;
      setOptions(o => ({ ...o, onlyServices: true }));
    }
  }, [hasServices]);

  useEffect(() => {
    if (!enabled) return;
    let alive = true;
    tmdb.getGenreCatalog()
      .then(c => { if (alive && c) setCatalog({ movie: c.movie ?? [], tv: c.tv ?? [] }); })
      .catch(() => {});
    return () => { alive = false; };
  }, [enabled]);

  const genres = useMemo(() => pickerGenres(catalog, options), [catalog, options]);

  const setOption = useCallback((key, value) => setOptions(o => {
    const next = { ...o, [key]: value };
    // Genre ids differ between the movie and TV catalogs.
    if (key === 'mediaType' && value !== o.mediaType) next.genreIds = [];
    // Drop any kids/family genre the viewer had picked before hiding them.
    if (key === 'hideKids' && value) next.genreIds = o.genreIds.filter(id => !KIDS_GENRE_IDS.has(id));
    return next;
  }), []);
  const toggleGenre = useCallback((id) => setOptions(o => ({
    ...o,
    genreIds: o.genreIds.includes(id) ? o.genreIds.filter(g => g !== id) : [...o.genreIds, id],
  })), []);

  const draw = useCallback(async (nextMode) => {
    const count = PICKER_MODES[nextMode];
    const opts = {
      ...options,
      onlyServices: options.onlyServices && hasServices,
      onlyWatchlist: options.onlyWatchlist && hasWatchlist,
    };
    const key = JSON.stringify([opts, region]);
    if (run.current.key !== key) {
      run.current = { key, pool: [], seen: new Set(), page: 0, totalPages: 1, target: 0, exhausted: false };
    }
    const cur = run.current;
    if (!watched.current) watched.current = userId ? await loadWatchedIds(userId) : { movie: new Set(), tv: new Set() };
    const excludeIds = watched.current[opts.mediaType];
    const unseen = () => cur.pool.filter(c => !cur.seen.has(c.id)).length;

    // Grow the pool only when there is not enough new to show. Tight filters
    // can come back thin from one page, so keep fetching (up to a cap) to
    // fill every slot before settling for fewer.
    for (let tries = 0; unseen() < count && tries < MAX_FETCHES_PER_DRAW; tries++) {
      if (opts.onlyWatchlist) {
        if (cur.exhausted) break;
        cur.target += POOL_TARGET;
        const { pool, exhausted } = await loadWatchlistPool({
          watchlistItems, options: opts, providerIds, region, excludeIds, target: cur.target,
        });
        cur.pool = pool;
        cur.exhausted = exhausted;
      } else {
        if (cur.page >= cur.totalPages) break;
        cur.page += 1;
        const savedIds = new Set((watchlistItems || [])
          .filter(i => (i.media_type || 'movie') === opts.mediaType)
          .map(i => Number(i.tmdb_id)));
        const { pool, totalPages } = await loadDiscoverPage({
          options: opts, providerIds, region, page: cur.page, excludeIds, savedIds,
        });
        const have = new Set(cur.pool.map(c => c.id));
        cur.pool = [...cur.pool, ...pool.filter(c => !have.has(c.id))];
        cur.totalPages = totalPages;
      }
    }

    const picked = drawFromPool(cur.pool, count, { seen: cur.seen });
    picked.forEach(c => cur.seen.add(c.id));
    // Spin again is only worth offering if it can show something different.
    const moreToLoad = opts.onlyWatchlist ? !cur.exhausted : cur.page < cur.totalPages;
    return { picked, canSpinAgain: cur.pool.length > picked.length || moreToLoad };
  }, [options, hasServices, hasWatchlist, region, userId, watchlistItems, providerIds]);

  const go = useCallback(async (nextMode = 'five') => {
    if (!enabled) return;
    setMode(nextMode);
    setPhase('spinning');
    const started = Date.now();
    let picked = [];
    let more = false;
    let failed = false;
    try {
      ({ picked, canSpinAgain: more } = await draw(nextMode));
    } catch {
      failed = true;
    }
    const wait = PICKER_MIN_SPIN_MS - (Date.now() - started);
    if (wait > 0) await sleep(wait);
    setResults(picked);
    setCanSpinAgain(more);
    setPhase(failed ? 'error' : picked.length ? 'results' : 'empty');
  }, [enabled, draw]);

  const spinAgain = useCallback(() => go(mode), [go, mode]);
  const backToOptions = useCallback(() => setPhase('setup'), []);
  const goToStep = useCallback((i) => {
    setStep(Math.max(0, Math.min(PICKER_STEPS.length - 1, i)));
    setPhase('setup');
  }, []);
  const nextStep = useCallback(() => setStep(i => Math.min(PICKER_STEPS.length - 1, i + 1)), []);
  const prevStep = useCallback(() => setStep(i => Math.max(0, i - 1)), []);

  const sentence = useMemo(() => pickerSentence(options, { genres, hasServices }), [options, genres, hasServices]);
  const filtersSummary = useMemo(() => pickerFiltersSummary(options, { hasServices }), [options, hasServices]);
  const answers = useMemo(() => pickerAnswers(options, { genres }), [options, genres]);

  return {
    options, setOption, toggleGenre, genres,
    hasServices, hasWatchlist,
    phase, mode, results, canSpinAgain,
    step, goToStep, nextStep, prevStep,
    sentence, filtersSummary, answers,
    go, spinAgain, backToOptions,
  };
}
