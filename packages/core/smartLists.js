// Smart lists (Premium): a custom list that stores filter rules instead of
// titles, and is filled each time it opens. Shared by web and mobile, so both
// apps read the same rules the same way.
//
// A smart list is a user_custom_lists row whose `rules` column is set
// (supabase/migrations/20260928100000_smart_lists.sql). That migration is the
// authority: only Premium can write rules, a smart list stays private, and it
// never holds items. These helpers decide what the UI offers and what it shows.
//
// Two kinds of source:
//   - discover   new titles from TMDB /discover, minus what you've watched.
//                The rules become Pick for Me's discover query, so a filter
//                means the same thing in both places.
//   - watchlist / history   your own saved or watched titles. Type, genre and
//                year come from what is stored; score, length and services
//                need a details call per title, capped and cached.
import { tmdb } from './tmdb.js';
import {
  PICKER_ERAS, PICKER_MIN_SCORES, PICKER_RUNTIMES, PICKER_EPISODE_RUNTIMES,
  loadDiscoverPage, regionFlatrate, walkDetails,
} from './tonightPicker.js';
import { SMART_LISTS } from './copy/smartLists.js';
import { TONIGHT_PICKER } from './copy/tonightPicker.js';

/** @typedef {'discover' | 'watchlist' | 'history'} SmartListSource */
/** @typedef {'any' | 'movie' | 'tv'} SmartListMediaType */

/**
 * @typedef {Object} SmartListRules
 * @property {1} v Schema version.
 * @property {SmartListSource} source
 * @property {SmartListMediaType} mediaType
 * @property {number[]} genreIds Any of these TMDB genre ids. Empty means any genre.
 * @property {string} era One of PICKER_ERAS ids.
 * @property {number|null} minScore Minimum TMDB score (vote_average).
 * @property {number|null} maxRuntime Movie length, or episode length for TV. Only with one media type.
 * @property {boolean} onlyServices Only titles streaming on the viewer's services.
 * @property {number|null} minMyRating History only: your own rating, on the stored 1-10 scale.
 * @property {boolean} hideWatched Discover and watchlist: leave out titles you've watched.
 */

/**
 * @typedef {Object} SmartListMatch
 * @property {string} id Stable React key.
 * @property {number} tmdb_id From a TMDB response or a stored row, never guessed.
 * @property {'movie'|'tv'} media_type
 * @property {string} title
 * @property {string|null} poster_path
 * @property {string|null} release_date
 * @property {number[]} genre_ids Carried so saving a match stores its genres.
 */

export const SMART_LIST_SOURCES = /** @type {SmartListSource[]} */ (['discover', 'watchlist', 'history']);
export const SMART_LIST_MEDIA_TYPES = /** @type {SmartListMediaType[]} */ (['any', 'movie', 'tv']);
export const SMART_LIST_ERAS = PICKER_ERAS.map(e => e.id);
export const SMART_LIST_MIN_SCORES = PICKER_MIN_SCORES;
export const SMART_LIST_MOVIE_RUNTIMES = PICKER_RUNTIMES;
export const SMART_LIST_EPISODE_RUNTIMES = PICKER_EPISODE_RUNTIMES;
/** Your own rating, stored 1-10 (half stars). 6 is three stars. */
export const SMART_LIST_MY_RATINGS = [null, 6, 8, 10];

/** Own titles checked against details (score, length, services) per open. Newest first. */
export const SMART_LIST_DETAIL_LIMIT = 60;

// News, talk and soap: never offered as a TV rule, same as Pick for Me.
const TV_EXCLUDED_GENRES = new Set([10763, 10767, 10766]);

/** @returns {SmartListRules} */
export function defaultSmartListRules() {
  return {
    v: 1,
    source: 'discover',
    mediaType: 'movie',
    genreIds: [],
    era: 'any',
    minScore: null,
    maxRuntime: null,
    onlyServices: false,
    minMyRating: null,
    hideWatched: true,
  };
}

const pick = (value, allowed, fallback) => (allowed.includes(value) ? value : fallback);

/**
 * Rules as stored, cleaned up: unknown values fall back to the default, and
 * rules that do not apply to the source or media type are cleared, so what is
 * saved is exactly what is applied.
 * @param {any} raw
 * @returns {SmartListRules | null} null when there are no rules (a manual list).
 */
export function normalizeSmartListRules(raw) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const d = defaultSmartListRules();
  const source = pick(raw.source, SMART_LIST_SOURCES, d.source);
  const mediaType = pick(raw.mediaType, SMART_LIST_MEDIA_TYPES, d.mediaType);
  const runtimes = mediaType === 'tv' ? SMART_LIST_EPISODE_RUNTIMES : SMART_LIST_MOVIE_RUNTIMES;
  const genreIds = Array.isArray(raw.genreIds)
    ? [...new Set(raw.genreIds.map(Number).filter(id => Number.isInteger(id) && id > 0))].slice(0, 20)
    : [];
  return {
    v: 1,
    source,
    mediaType,
    genreIds,
    era: pick(raw.era, SMART_LIST_ERAS, d.era),
    minScore: pick(raw.minScore ?? null, SMART_LIST_MIN_SCORES, null),
    // Length means minutes per movie or per episode, so it only reads with one type.
    maxRuntime: mediaType === 'any' ? null : pick(raw.maxRuntime ?? null, runtimes, null),
    onlyServices: !!raw.onlyServices,
    minMyRating: source === 'history' ? pick(raw.minMyRating ?? null, SMART_LIST_MY_RATINGS, null) : null,
    hideWatched: source === 'history' ? false : raw.hideWatched !== false,
  };
}

/** @param {{ rules?: any } | null | undefined} list */
export function isSmartList(list) {
  return normalizeSmartListRules(list?.rules) !== null;
}

/**
 * Genres to offer for the chosen type: that type's catalog, or both for
 * "movies and shows", alphabetical.
 * @param {{ movie?: Array<{id:number,name:string}>, tv?: Array<{id:number,name:string}> }} catalog
 * @param {SmartListMediaType} mediaType
 */
export function smartListGenres(catalog, mediaType) {
  const lists = mediaType === 'any' ? [catalog?.movie ?? [], catalog?.tv ?? []] : [catalog?.[mediaType] ?? []];
  const byId = new Map();
  for (const g of lists.flat()) if (!TV_EXCLUDED_GENRES.has(g.id)) byId.set(g.id, g);
  return [...byId.values()].sort((a, b) => a.name.localeCompare(b.name));
}

/** @param {string} eraId */
function eraRange(eraId) {
  const era = PICKER_ERAS.find(e => e.id === eraId) ?? PICKER_ERAS[0];
  return { gte: era.gte?.() ?? null, lte: era.lte?.() ?? null };
}

/**
 * Whether one title passes the rules. A field that is not known yet (a saved
 * title has no stored score or length) is `null` rather than a miss, so the
 * caller can fetch details and ask again.
 *
 * @param {{
 *   media_type?: string, genre_ids?: number[] | null, release_date?: string | null,
 *   vote_average?: number | null, runtime?: number | null,
 *   provider_ids?: number[] | null, my_rating?: number | null,
 * }} c provider_ids: flatrate services in the viewer's region, when known.
 * @param {SmartListRules} rules
 * @param {{ providerIds?: number[] }} [ctx]
 * @returns {boolean | null}
 */
export function evaluateSmartListRules(c, rules, { providerIds = [] } = {}) {
  let unknown = false;
  const type = c.media_type === 'tv' ? 'tv' : 'movie';
  if (rules.mediaType !== 'any' && type !== rules.mediaType) return false;
  if (rules.genreIds.length) {
    if (!c.genre_ids?.length) unknown = true;
    else if (!c.genre_ids.some(id => rules.genreIds.includes(id))) return false;
  }
  const { gte, lte } = eraRange(rules.era);
  if (gte || lte) {
    if (!c.release_date) unknown = true;
    else if ((gte && c.release_date < gte) || (lte && c.release_date > lte)) return false;
  }
  if (rules.minScore) {
    if (c.vote_average == null) unknown = true;
    else if (c.vote_average < rules.minScore) return false;
  }
  if (rules.maxRuntime) {
    if (c.runtime == null) unknown = true;
    else if (c.runtime > rules.maxRuntime) return false;
  }
  if (rules.onlyServices) {
    if (c.provider_ids == null) unknown = true;
    else if (!c.provider_ids.some(id => providerIds.includes(id))) return false;
  }
  if (rules.minMyRating && !(Number(c.my_rating) >= rules.minMyRating)) return false;
  return unknown ? null : true;
}

const keyOf = (type, id) => `${type}:${id}`;

/**
 * The titles a watchlist or history rule set draws from, one row per title,
 * newest first. History keeps each title's best rating across rewatches.
 * @param {SmartListRules} rules
 * @param {{ watchlistItems?: any[], historyEntries?: any[] }} library
 */
export function smartListLibrary(rules, { watchlistItems = [], historyEntries = [] }) {
  const rows = rules.source === 'history' ? historyEntries : watchlistItems;
  const dateOf = (r) => String(rules.source === 'history' ? (r.watched_at || r.created_at || '') : (r.created_at || ''));
  const byKey = new Map();
  for (const r of rows || []) {
    const id = Number(r.tmdb_id);
    if (!Number.isInteger(id) || id <= 0) continue;
    const type = r.media_type === 'tv' ? 'tv' : 'movie';
    const key = keyOf(type, id);
    const prev = byKey.get(key);
    const rating = Math.max(Number(prev?.my_rating) || 0, Number(r.rating) || 0) || null;
    if (!prev || dateOf(r) > prev._date) {
      byKey.set(key, {
        tmdb_id: id, media_type: type, title: r.title || r.name || '',
        poster_path: r.poster_path ?? null, release_date: r.release_date ?? null,
        genre_ids: r.genre_ids ?? null, my_rating: rating, _date: dateOf(r),
      });
    } else {
      prev.my_rating = rating;
    }
  }
  return [...byKey.values()].sort((a, b) => b._date.localeCompare(a._date));
}

/** @param {any} c @returns {SmartListMatch} */
const toMatch = (c) => ({
  id: keyOf(c.media_type, c.tmdb_id),
  tmdb_id: c.tmdb_id,
  media_type: c.media_type,
  title: c.title,
  poster_path: c.poster_path ?? null,
  release_date: c.release_date ?? null,
  genre_ids: c.genre_ids ?? [],
});

/**
 * Matches from your own titles. Stored fields decide first; titles that need
 * details (a score, length or services rule, or a missing genre or date) are
 * checked newest first, up to SMART_LIST_DETAIL_LIMIT per open.
 *
 * @param {{
 *   rules: SmartListRules,
 *   watchlistItems?: any[], historyEntries?: any[],
 *   watched?: { movie: Set<number>, tv: Set<number> },
 *   providerIds?: number[], region?: string,
 *   client?: any, gapMs?: number,
 * }} opts
 * @returns {Promise<{ items: SmartListMatch[], unchecked: number }>}
 */
export async function loadLibraryMatches({
  rules, watchlistItems = [], historyEntries = [], watched,
  providerIds = [], region = 'US', client = tmdb, gapMs = 120,
}) {
  const library = smartListLibrary(rules, { watchlistItems, historyEntries })
    .filter(c => !(rules.hideWatched && watched?.[c.media_type]?.has(c.tmdb_id)));
  const ctx = { providerIds };
  const verdicts = library.map(c => evaluateSmartListRules(c, rules, ctx));
  const pending = library.filter((_, i) => verdicts[i] === null);
  const toCheck = pending.slice(0, SMART_LIST_DETAIL_LIMIT);
  /** @type {Map<string, boolean>} */
  const checked = new Map();
  for (const type of /** @type {const} */ (['movie', 'tv'])) {
    const batch = toCheck.filter(c => c.media_type === type).map(c => ({ ...c, id: c.tmdb_id }));
    if (!batch.length) continue;
    const walked = await walkDetails(client, type, batch, { gapMs, until: () => false });
    for (const { item, slim } of walked) {
      if (!slim) { checked.set(keyOf(type, item.tmdb_id), false); continue; }
      const full = {
        ...item,
        genre_ids: slim.genre_ids?.length ? slim.genre_ids : item.genre_ids,
        release_date: item.release_date || slim.release_date,
        vote_average: slim.vote_average,
        runtime: slim.runtime,
        provider_ids: regionFlatrate({ 'watch/providers': slim.watchProviders }, region).map(p => p.id),
      };
      // Still unknown with details in hand (no release date on TMDB): not a match.
      checked.set(keyOf(type, item.tmdb_id), evaluateSmartListRules(full, rules, ctx) === true);
    }
  }
  const items = library
    .filter((c, i) => verdicts[i] === true || checked.get(keyOf(c.media_type, c.tmdb_id)) === true)
    .map(toMatch);
  return { items, unchecked: pending.length - toCheck.length };
}

/**
 * The rules as Pick for Me options for one media type, so the discover query
 * is the one the picker already sends.
 * @param {SmartListRules} rules
 * @param {'movie'|'tv'} type
 * @param {{ hideKids?: boolean }} [ctx]
 */
export function smartListPickerOptions(rules, type, { hideKids = false } = {}) {
  return {
    mediaType: type,
    maxRuntime: type === 'movie' ? rules.maxRuntime : null,
    tvFormat: /** @type {'any'} */ ('any'),
    maxEpisodeRuntime: type === 'tv' ? rules.maxRuntime : null,
    genreIds: rules.genreIds,
    era: rules.era,
    minScore: rules.minScore,
    language: null,
    onlyServices: rules.onlyServices,
    onlyWatchlist: false,
    // Picking Family or Kids as a rule is asking for them.
    hideKids: hideKids && !rules.genreIds.some(id => id === 10751 || id === 10762),
  };
}

/** Media types a rule set queries. @param {SmartListRules} rules @returns {Array<'movie'|'tv'>} */
export const smartListTypes = (rules) => (rules.mediaType === 'any' ? ['movie', 'tv'] : [rules.mediaType]);

/**
 * One page of new discoveries per media type, interleaved for "movies and
 * shows", minus watched titles and anything already on `seen`.
 * @param {{
 *   rules: SmartListRules, page?: number,
 *   watched?: { movie: Set<number>, tv: Set<number> },
 *   providerIds?: number[], region?: string, hideKids?: boolean,
 *   seen?: Set<string>, client?: any,
 * }} opts
 * @returns {Promise<{ items: SmartListMatch[], hasMore: boolean }>}
 */
export async function loadDiscoverMatches({
  rules, page = 1, watched, providerIds = [], region = 'US', hideKids = false, seen = new Set(), client = tmdb,
}) {
  const types = smartListTypes(rules);
  const pages = await Promise.all(types.map(type => loadDiscoverPage({
    options: smartListPickerOptions(rules, type, { hideKids }),
    providerIds, region, page, client, gapMs: 0,
    excludeIds: rules.hideWatched ? (watched?.[type] ?? new Set()) : new Set(),
  })));
  /** @type {SmartListMatch[]} */
  const items = [];
  const longest = Math.max(0, ...pages.map(p => p.pool.length));
  for (let i = 0; i < longest; i++) {
    pages.forEach((p, t) => {
      const c = p.pool[i];
      if (!c) return;
      const match = toMatch({ ...c, tmdb_id: c.id, media_type: types[t] });
      if (seen.has(match.id)) return;
      seen.add(match.id);
      items.push(match);
    });
  }
  return { items, hasMore: pages.some(p => page < p.totalPages) };
}

/** Watched title ids per type, from history rows already loaded. @param {any[]} entries */
export function watchedIdsFromHistory(entries) {
  const out = { movie: new Set(), tv: new Set() };
  for (const e of entries || []) (e.media_type === 'tv' ? out.tv : out.movie).add(Number(e.tmdb_id));
  return out;
}

/**
 * The rules in a few words, for a smart list's subtitle:
 * "New discoveries · Movies · Comedy or Drama · 2010s · TMDB 7+".
 * @param {SmartListRules} rules
 * @param {{ genres?: Array<{id:number,name:string}> }} [ctx] genre names; unknown ids are skipped
 * @returns {string}
 */
export function smartListSummary(rules, { genres = [] } = {}) {
  const parts = [SMART_LISTS.sources[rules.source].label, SMART_LISTS.types[rules.mediaType]];
  const names = rules.genreIds.map(id => genres.find(g => g.id === id)?.name).filter(Boolean);
  if (names.length) parts.push(names.length > 3 ? SMART_LISTS.genreCount(names.length) : names.join(SMART_LISTS.genreJoin));
  if (rules.era !== 'any') parts.push(TONIGHT_PICKER.eras[rules.era]);
  if (rules.minScore) parts.push(SMART_LISTS.scoreSummary(rules.minScore));
  if (rules.maxRuntime) parts.push(rules.mediaType === 'tv' ? TONIGHT_PICKER.episodeRuntime(rules.maxRuntime) : TONIGHT_PICKER.runtimes(rules.maxRuntime));
  if (rules.minMyRating) parts.push(SMART_LISTS.myRating(rules.minMyRating));
  if (rules.onlyServices) parts.push(TONIGHT_PICKER.summary.services);
  return parts.join(' · ');
}
