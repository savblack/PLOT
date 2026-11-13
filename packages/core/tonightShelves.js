import { useEffect, useMemo, useState } from 'react';
import {
  loadWatchlistPool, loadDiscoverPage, loadWatchedIds,
  pickerProviderIds, resolveKeywordGenres, isKeywordGenre,
} from './tonightPicker.js';
import { TONIGHT_PICKER } from './copy/tonightPicker.js';

// Just Decide's shelves (Nov 2026 redesign, option D). The page opens already
// full: shelves of titles that fit tonight, drawn from the viewer's watchlist
// and, for Premium, their services. Chips along the top set the same picker
// options the four questions used to, and narrow every shelf at once; "Pick
// one for me" then runs the existing picker (tonightPicker.js) on them.
//
// Cost: one watchlist walk per media type (details are cached for the session,
// shared with the picker) and, for Premium, one discover page.
//
// Genre ids below are TMDB's fixed genre catalog ids (the same ones
// FEATURED_GENRES in tonightPicker.js uses), not title ids. Negative ids are
// the picker's keyword-backed genres for shows.

/** @typedef {import('./tonightPicker.js').PickerOptions} PickerOptions */
/** @typedef {import('./tonightPicker.js').PickerCandidate} PickerCandidate */

/** Genres behind the Light and Gripping chips and shelves, per type. */
export const SHELF_GENRES = {
  light: { movie: [35, 16, 10749], tv: [35, 16] },
  gripping: { movie: [53, 80, 9648, 27], tv: [80, 9648, -53] },
};

/** "Short" per type: movie length, or average episode length for shows. */
export const SHORT_LIMIT = { movie: 120, tv: 30 };

/** How many titles a shelf shows. */
export const SHELF_SIZE = 12;
// Enough watchlist matches to fill several shelves without walking the whole list.
const WATCHLIST_TARGET = 40;

/**
 * @typedef {'movies'|'shows'|'short'|'light'|'gripping'|'recent'|'rated'|'services'} ShelfChip
 */

/** Chips in the order they're shown. `services` only when the viewer has services. */
export const SHELF_CHIPS = /** @type {ShelfChip[]} */ (['movies', 'shows', 'short', 'light', 'gripping', 'recent', 'rated', 'services']);

const hasAll = (list, ids) => ids.every(id => list.includes(id));

/**
 * Whether a chip is on for these options.
 * @param {ShelfChip} chip
 * @param {PickerOptions} o
 */
export function chipOn(chip, o) {
  switch (chip) {
    case 'movies': return o.mediaType === 'movie';
    case 'shows': return o.mediaType === 'tv';
    case 'short': return o.mediaType === 'tv' ? o.maxEpisodeRuntime === SHORT_LIMIT.tv : o.maxRuntime === SHORT_LIMIT.movie;
    case 'light': return hasAll(o.genreIds, SHELF_GENRES.light[o.mediaType]);
    case 'gripping': return hasAll(o.genreIds, SHELF_GENRES.gripping[o.mediaType]);
    case 'recent': return o.era === 'recent';
    case 'rated': return o.minScore === 7;
    case 'services': return o.onlyServices;
    default: return false;
  }
}

/**
 * The options after tapping a chip. Switching type drops the genre chips,
 * since genre ids differ between movies and shows.
 * @param {ShelfChip} chip
 * @param {PickerOptions} o
 * @returns {PickerOptions}
 */
export function toggleChip(chip, o) {
  const on = chipOn(chip, o);
  const genres = (key) => {
    const ids = SHELF_GENRES[key][o.mediaType];
    return on ? o.genreIds.filter(id => !ids.includes(id)) : [...new Set([...o.genreIds, ...ids])];
  };
  switch (chip) {
    case 'movies': return on ? o : { ...o, mediaType: 'movie', genreIds: [], tvFormat: 'any', maxEpisodeRuntime: null };
    case 'shows': return on ? o : { ...o, mediaType: 'tv', genreIds: [], maxRuntime: null };
    case 'short': return o.mediaType === 'tv'
      ? { ...o, maxEpisodeRuntime: on ? null : SHORT_LIMIT.tv }
      : { ...o, maxRuntime: on ? null : SHORT_LIMIT.movie };
    case 'light': return { ...o, genreIds: genres('light') };
    case 'gripping': return { ...o, genreIds: genres('gripping') };
    case 'recent': return { ...o, era: on ? 'any' : 'recent' };
    case 'rated': return { ...o, minScore: on ? null : 7 };
    case 'services': return { ...o, onlyServices: !on };
    default: return o;
  }
}

/**
 * The label for a chip, from the copy catalog.
 * @param {ShelfChip} chip
 * @param {'movie'|'tv'} mediaType
 */
export function chipLabel(chip, mediaType) {
  const C = TONIGHT_PICKER.chips;
  if (chip === 'short') return C.short[mediaType];
  return C[chip];
}

/**
 * @typedef {{ id: 'watchlist'|'short'|'light'|'gripping'|'services', title: string, note?: string, items: PickerCandidate[], locked?: boolean }} Shelf
 */

const isShort = (c) => c.runtime != null && c.runtime <= SHORT_LIMIT[c.media_type];
const inGenres = (c, ids) => ids.some(id => (isKeywordGenre(id) ? c.kw_genres?.includes(id) : c.genre_ids.includes(id)));

/**
 * Shelves from the watchlist matches and the services page. A facet the
 * viewer already chose (a Short chip, a genre chip) doesn't get its own
 * shelf, since every shelf already has it. Empty shelves are left out.
 *
 * @param {{ watchlist: PickerCandidate[], services: PickerCandidate[], options: PickerOptions, hasServices: boolean, premium: boolean }} input
 * @returns {Shelf[]}
 */
export function buildShelves({ watchlist, services, options, hasServices, premium }) {
  const S = TONIGHT_PICKER.shelves;
  const type = options.mediaType;
  const cap = (list) => list.slice(0, SHELF_SIZE);
  /** @type {Shelf[]} */
  const shelves = [{ id: 'watchlist', title: S.watchlist, items: cap(watchlist) }];
  if (!chipOn('short', options)) {
    shelves.push({ id: 'short', title: S.short[type], note: S.shortNote[type], items: cap(watchlist.filter(isShort)) });
  }
  const genreChipOn = chipOn('light', options) || chipOn('gripping', options);
  if (!genreChipOn) {
    shelves.push({ id: 'light', title: S.light, items: cap(watchlist.filter(c => inGenres(c, SHELF_GENRES.light[type]))) });
    shelves.push({ id: 'gripping', title: S.gripping, items: cap(watchlist.filter(c => inGenres(c, SHELF_GENRES.gripping[type]))) });
  }
  const out = shelves.filter(s => s.items.length);
  if (premium) {
    if (services.length) out.push({ id: 'services', title: hasServices && options.onlyServices ? S.services : S.popular, items: cap(services) });
  } else {
    out.push({ id: 'services', title: hasServices ? S.services : S.popular, items: [], locked: true });
  }
  return out;
}

/**
 * Loads what the shelves draw from for the current options. Watchlist
 * matches for everyone (they're the viewer's own saves); the discover page
 * only for Premium, since finding new titles is what Premium buys.
 *
 * @param {{
 *   options: PickerOptions,
 *   premium: boolean,
 *   userId: string|null|undefined,
 *   watchlistItems: any[] | null | undefined,
 *   watchlistReady?: boolean,
 *   streamingProviders: any,
 *   region: string,
 * }} input
 */
export function useTonightShelves({ options, premium, userId, watchlistItems, watchlistReady = true, streamingProviders, region }) {
  const providerIds = useMemo(() => pickerProviderIds(streamingProviders), [streamingProviders]);
  const hasServices = providerIds.length > 0;
  const [state, setState] = useState(/** @type {{ key: string, watchlist: PickerCandidate[], services: PickerCandidate[], loading: boolean, error: boolean }} */ ({ key: '', watchlist: [], services: [], loading: true, error: false }));
  const watchlistKey = useMemo(() => (watchlistItems || []).map(i => `${i.media_type}:${i.tmdb_id}`).sort().join('|'), [watchlistItems]);
  const key = JSON.stringify([options, premium, userId, region, watchlistKey, providerIds]);

  useEffect(() => {
    if (!watchlistReady) return undefined;
    let alive = true;
    // Debounced, so tapping three chips in a row loads once.
    const timer = setTimeout(async () => {
      setState(s => ({ ...s, loading: true }));
      try {
        const opts = { ...options, onlyServices: options.onlyServices && hasServices };
        if (opts.genreIds.some(isKeywordGenre)) opts.keywordGenres = await resolveKeywordGenres(opts.genreIds);
        const watched = userId ? await loadWatchedIds(userId).catch(() => null) : null;
        const excludeIds = watched?.[opts.mediaType] ?? new Set();
        // Shelves sort the watchlist themselves, so its walk ignores the
        // services box: a saved title off your services still counts.
        const wl = await loadWatchlistPool({
          watchlistItems, options: { ...opts, onlyServices: false, onlyWatchlist: true }, providerIds, region, excludeIds, target: WATCHLIST_TARGET,
        });
        let services = [];
        if (premium) {
          const savedIds = new Set((watchlistItems || []).filter(i => (i.media_type || 'movie') === opts.mediaType).map(i => Number(i.tmdb_id)));
          const page = await loadDiscoverPage({ options: { ...opts, onlyWatchlist: false }, providerIds, region, excludeIds, savedIds });
          services = page.pool.filter(c => !savedIds.has(c.id));
        }
        if (alive) setState({ key, watchlist: wl.pool, services, loading: false, error: false });
      } catch {
        if (alive) setState(s => ({ ...s, key, loading: false, error: true }));
      }
    }, 250);
    return () => { alive = false; clearTimeout(timer); };
    // `key` covers every input above.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, watchlistReady]);

  const shelves = useMemo(
    () => buildShelves({ watchlist: state.watchlist, services: state.services, options, hasServices, premium }),
    [state.watchlist, state.services, options, hasServices, premium],
  );
  return { shelves, hasServices, loading: state.loading, error: state.error, stale: state.key !== key };
}
