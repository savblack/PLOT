// Home's two recommendation shelves: "Because you watched <title>" and
// "Recommended for you". No AI: both read TMDB's own per-title
// recommendations (people who liked this also liked that), which the details
// call already appends, and rank them with plain arithmetic over the viewer's
// history.
//
//   1. Seeds: the titles in history that say the most about taste. Rating
//      first (4 stars and up beats unrated), then how recently it was watched.
//      Did-not-finish and low-rated titles are never seeds.
//   2. Because you watched: one seed's recommendations. The seed rotates daily
//      among the top few, so the shelf is not the same title every visit.
//   3. Recommended for you: every seed's recommendations pooled. A title gets
//      points from each seed that suggests it (weighted by that seed and by how
//      high TMDB ranked it), plus a small bonus for the viewer's usual genres.
//      Three favorites pointing at the same show beats one.
//
// Anything already in history, on the watchlist or being watched is left
// out, and so is anything first released more than RECENT_YEARS ago: the
// shelves recommend recent titles only (Savannah, 16 Nov 2026). Seeds can be
// any age; only what is recommended has to be recent.
//
// Cost: the finished shelves are kept on the device for the day
// (dailyRecs*), so the seed details calls run at most once per device per
// day. Pure functions here; fetching and storage are useRecommendationShelves
// in useHomeShelves.js. Rendering is per app.

import { KIDS_GENRE_IDS } from './tmdb.js';
import { recommendationsFromDetails, tmdbIdFromItem, mediaTypeFromItem } from './media.js';
import { normalizeRating } from './ratings.js';

/** Seeds whose details are fetched. Each is one details call, usually cached. */
export const MAX_SEEDS = 8;
/** "Because you watched" rotates daily among this many of the best seeds. */
const BECAUSE_ROTATION = 3;
/** A "Because you watched" shelf with fewer titles than this is not shown. */
export const MIN_BECAUSE_ITEMS = 4;
/** "Recommended for you" needs this many seeds, or it is one seed's list again. */
export const MIN_FOR_YOU_SEEDS = 3;
const SHELF_LIMIT = 20;
/** Below this (1-10 scale, under 3 stars) a rating says "not my taste". */
const MIN_SEED_RATING = 6;
/** An unrated title counts as a mild yes. */
const UNRATED_WEIGHT = 0.45;
/** Recency half-life: a title watched this long ago counts half as much. */
const HALF_LIFE_DAYS = 180;
/** Weight of the genre bonus relative to one seed's full vote. */
const GENRE_BONUS = 0.35;
/** Recommended titles must have first come out within this many years. */
export const RECENT_YEARS = 10;

/**
 * @typedef {{ tmdb_id: number | string, media_type: string, title?: string | null,
 *   rating?: number | null, watched_at?: string | null, dnf?: boolean | null,
 *   genre_ids?: number[] | null }} HistoryRow
 * @typedef {{ key: string, tmdbId: number, mediaType: 'movie' | 'tv', title: string,
 *   weight: number, genreIds: number[] }} Seed
 */

/** Stable key for a title across history, lists and TMDB results. */
export const recKey = (mediaType, id) => `${mediaType}:${Number(id)}`;

const itemKey = (item) => recKey(mediaTypeFromItem(item), tmdbIdFromItem(item));

const DAY_MS = 86_400_000;

/**
 * How strongly one history row speaks for the viewer's taste: 0 when it
 * should not be a seed at all.
 * @param {HistoryRow} row
 * @param {number} now ms
 */
export function seedWeight(row, now) {
  if (row?.dnf) return 0;
  // normalizeRating answers 0 for "not rated".
  const rating = normalizeRating(row?.rating);
  if (rating > 0 && rating < MIN_SEED_RATING) return 0;
  const taste = rating === 0 ? UNRATED_WEIGHT : rating / 10;
  const watched = Date.parse(row?.watched_at ?? '');
  const ageDays = Number.isFinite(watched) ? Math.max(0, (now - watched) / DAY_MS) : HALF_LIFE_DAYS * 2;
  const recency = Math.pow(0.5, ageDays / HALF_LIFE_DAYS);
  // Recency matters, but a favorite from two years ago should still beat
  // something unrated from last night: the floor keeps old loves in play.
  return taste * (0.5 + 0.5 * recency);
}

/**
 * The history titles to recommend from, strongest first. One per title (a
 * rewatch counts once, at its best weight).
 * @param {HistoryRow[]} history
 * @param {{ now?: number, limit?: number }} [opts]
 * @returns {Seed[]}
 */
export function pickSeeds(history, { now = Date.now(), limit = MAX_SEEDS } = {}) {
  /** @type {Map<string, Seed>} */
  const best = new Map();
  for (const row of history ?? []) {
    const mediaType = row?.media_type;
    const tmdbId = Number(row?.tmdb_id);
    if ((mediaType !== 'movie' && mediaType !== 'tv') || !tmdbId) continue;
    const weight = seedWeight(row, now);
    if (weight <= 0) continue;
    const key = recKey(mediaType, tmdbId);
    const prev = best.get(key);
    if (prev && prev.weight >= weight) continue;
    best.set(key, { key, tmdbId, mediaType, title: row.title || '', weight, genreIds: row.genre_ids || [] });
  }
  return [...best.values()]
    .sort((a, b) => b.weight - a.weight || a.key.localeCompare(b.key))
    .slice(0, limit);
}

/**
 * Keys of titles the viewer already has: watched, saved or in progress.
 * @param {Array<Array<{ tmdb_id?: number | string, id?: number | string, media_type?: string }>>} lists
 * @returns {Set<string>}
 */
export function ownedKeys(...lists) {
  const out = new Set();
  for (const list of lists) for (const row of list ?? []) {
    const id = Number(row?.tmdb_id ?? row?.id);
    const type = row?.media_type;
    if (id && (type === 'movie' || type === 'tv')) out.add(recKey(type, id));
  }
  return out;
}

/**
 * Kids and family titles stay out unless the viewer's seeds include them.
 * @param {Seed[]} seeds
 */
function allowsKids(seeds) {
  return seeds.some(s => s.genreIds.some(id => KIDS_GENRE_IDS.has(id)));
}

/**
 * The earliest release date a recommendation may have: today, RECENT_YEARS
 * years back (YYYY-MM-DD, so it compares as a string).
 * @param {string} today YYYY-MM-DD
 */
export function recentCutoff(today) {
  const year = Number(String(today).slice(0, 4));
  return Number.isFinite(year) && year > 0 ? `${year - RECENT_YEARS}${String(today).slice(4, 10)}` : '';
}

/**
 * Whether a TMDB item first came out on or after the cutoff. A show counts by
 * its first air date, so a long-running series that began before the cutoff
 * is left out. An item with no date is left out too: it is usually unreleased
 * or a stub.
 * @param {{ release_date?: string, first_air_date?: string }} item
 * @param {string} cutoff YYYY-MM-DD, or '' for no cutoff
 */
export function isRecentRelease(item, cutoff) {
  if (!cutoff) return true;
  const date = item?.release_date || item?.first_air_date || '';
  return /^\d{4}-\d{2}-\d{2}/.test(date) && date >= cutoff;
}

/**
 * One details payload's recommendations, cleaned: no owned titles, nothing
 * older than the cutoff, no kids titles unless allowed.
 * @param {any} details
 * @param {Set<string>} owned
 * @param {boolean} kidsOk
 * @param {string} cutoff
 */
function usableRecs(details, owned, kidsOk, cutoff) {
  return recommendationsFromDetails(details, { limit: 40 })
    .filter(item => !owned.has(itemKey(item)))
    .filter(item => isRecentRelease(item, cutoff))
    .filter(item => kidsOk || !(item.genre_ids || []).some(id => KIDS_GENRE_IDS.has(id)));
}

/** Day number for the rotation, from a YYYY-MM-DD string. */
function dayIndex(today) {
  const t = Date.parse(`${today}T00:00:00Z`);
  return Number.isFinite(t) ? Math.floor(t / DAY_MS) : 0;
}

/**
 * The "Because you watched" shelf: one seed and what TMDB recommends from it.
 * Rotates daily among the top seeds that have enough to show.
 * @param {Seed[]} seeds strongest first
 * @param {Map<string, any>} detailsByKey details (with recommendations) per seed key
 * @param {{ owned: Set<string>, today: string, limit?: number }} opts
 * @returns {{ seed: Seed, items: any[] } | null}
 */
export function becauseYouWatched(seeds, detailsByKey, { owned, today, limit = SHELF_LIMIT }) {
  const kidsOk = allowsKids(seeds);
  const cutoff = recentCutoff(today);
  const candidates = [];
  for (const seed of seeds) {
    const items = usableRecs(detailsByKey.get(seed.key), owned, kidsOk, cutoff);
    if (items.length >= MIN_BECAUSE_ITEMS) candidates.push({ seed, items: items.slice(0, limit) });
    if (candidates.length >= BECAUSE_ROTATION) break;
  }
  if (!candidates.length) return null;
  return candidates[dayIndex(today) % candidates.length];
}

/**
 * The "Recommended for you" shelf: every seed's recommendations pooled and
 * ranked. Each item carries `_because`, the title of the seed that did the
 * most to put it here, so an app can say why.
 * @param {Seed[]} seeds
 * @param {Map<string, any>} detailsByKey
 * @param {{ owned: Set<string>, today: string, exclude?: Set<string>, limit?: number }} opts
 *   `exclude` holds keys another shelf already shows.
 * @returns {any[]}
 */
export function recommendedForYou(seeds, detailsByKey, { owned, today, exclude = new Set(), limit = SHELF_LIMIT }) {
  const usable = seeds.filter(s => detailsByKey.get(s.key));
  if (usable.length < MIN_FOR_YOU_SEEDS) return [];
  const kidsOk = allowsKids(seeds);
  const cutoff = recentCutoff(today);

  // The viewer's genre profile, from the seeds, as shares that sum to 1.
  const genreWeight = new Map();
  let genreTotal = 0;
  for (const s of usable) for (const id of s.genreIds) {
    genreWeight.set(id, (genreWeight.get(id) || 0) + s.weight);
    genreTotal += s.weight;
  }

  /** @type {Map<string, { item: any, score: number, seeds: number, top: { title: string, vote: number } }>} */
  const pool = new Map();
  for (const seed of usable) {
    const recs = usableRecs(detailsByKey.get(seed.key), owned, kidsOk, cutoff);
    recs.forEach((item, i) => {
      const key = itemKey(item);
      if (exclude.has(key)) return;
      // TMDB orders its list; the first few are the strongest matches.
      const vote = seed.weight * (1 - (0.5 * i) / Math.max(recs.length, 1));
      const entry = pool.get(key) ?? { item, score: 0, seeds: 0, top: { title: seed.title, vote: 0 } };
      entry.score += vote;
      entry.seeds += 1;
      if (vote > entry.top.vote) entry.top = { title: seed.title, vote };
      pool.set(key, entry);
    });
  }

  const ranked = [...pool.values()].map(entry => {
    const genres = entry.item.genre_ids || [];
    const share = genreTotal && genres.length
      ? genres.reduce((sum, id) => sum + (genreWeight.get(id) || 0), 0) / genreTotal / genres.length
      : 0;
    return { ...entry, score: entry.score + GENRE_BONUS * Math.min(1, share * 3) };
  });
  ranked.sort((a, b) => b.score - a.score
    || b.seeds - a.seeds
    || (b.item.vote_count || 0) - (a.item.vote_count || 0)
    || itemKey(a.item).localeCompare(itemKey(b.item)));
  return ranked.slice(0, limit).map(entry => ({ ...entry.item, _because: entry.top.title }));
}

/* ── Kept for the day ──────────────────────────────────────────────────────
   The finished shelves are stored on the device, per account, for the
   calendar day they were built. Only the fields a poster card reads are kept,
   so a stored day is a few kilobytes. Owned titles are filtered again when
   the shelves are drawn (filterOwnedShelves), so a title saved or watched
   later the same day still drops out straight away. */

const STORED_FIELDS = ['id', 'media_type', 'title', 'name', 'poster_path', 'backdrop_path',
  'release_date', 'first_air_date', 'genre_ids', 'vote_average', 'vote_count', 'original_language', '_because'];

/** Storage key for one account's stored shelves. @param {string} userId */
export const dailyRecsKey = (userId) => `plot:home-recs:v1:${userId}`;

/** @param {any} item */
function slimItem(item) {
  /** @type {Record<string, any>} */
  const out = {};
  for (const field of STORED_FIELDS) if (item?.[field] != null) out[field] = item[field];
  return out;
}

/**
 * @typedef {{ because: { seed: Seed, items: any[] } | null, forYou: any[] }} RecShelves
 */

/**
 * The string to store, or null when there is nothing worth keeping. An empty
 * result is never stored: a new account that logs its first titles today
 * should get shelves today, not tomorrow.
 * @param {RecShelves} shelves
 * @param {string} today YYYY-MM-DD
 * @returns {string | null}
 */
export function serializeDailyRecs(shelves, today) {
  const because = shelves?.because?.items?.length ? shelves.because : null;
  const forYou = shelves?.forYou ?? [];
  if (!because && !forYou.length) return null;
  return JSON.stringify({
    v: 1,
    day: today,
    because: because && { seed: because.seed, items: because.items.map(slimItem) },
    forYou: forYou.map(slimItem),
  });
}

/**
 * Stored shelves, if they were built today; otherwise null (fetch again).
 * @param {string | null | undefined} raw
 * @param {string} today YYYY-MM-DD
 * @returns {RecShelves | null}
 */
export function parseDailyRecs(raw, today) {
  if (!raw) return null;
  try {
    const data = JSON.parse(raw);
    if (data?.v !== 1 || data.day !== today) return null;
    const because = data.because && Array.isArray(data.because.items) && data.because.seed?.title
      ? data.because : null;
    return { because, forYou: Array.isArray(data.forYou) ? data.forYou : [] };
  } catch {
    return null;
  }
}

/**
 * Drop titles the viewer has come to own since the shelves were built.
 * @param {RecShelves} shelves
 * @param {Set<string>} owned
 * @returns {RecShelves}
 */
export function filterOwnedShelves(shelves, owned) {
  const keep = (item) => !owned.has(itemKey(item));
  const items = shelves.because?.items.filter(keep) ?? [];
  return {
    because: shelves.because && items.length ? { seed: shelves.because.seed, items } : null,
    forYou: shelves.forYou.filter(keep),
  };
}
