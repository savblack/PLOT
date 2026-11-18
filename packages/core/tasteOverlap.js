// Taste overlap: how two people's watch histories compare. Part of the Premium
// "Deeper viewing stats" benefit (copy/plansPage.js, id 'fullStats').
//
// Pure functions over history rows, the shape the `taste_overlap` RPC returns
// (one row per title: tmdb_id, media_type, title, poster_path, rating 1-10,
// genre_ids, release_date). Fetching lives in useTasteOverlap.js; rendering is
// per app. Rows are deduplicated again here so the maths holds for any history
// list, not only the RPC's.

import { genreCounts, averageStars, detailsKey } from './historyStats.js';
import { normalizeRating, MAX_RATING } from './ratings.js';
import { colors } from './tokens.js';

/**
 * Where share posts point: a public page explaining taste match, since the
 * people reading a post aren't signed in. Never the comparison itself: it
 * belongs to two people, and only one of them chose to post it.
 */
export const SHARE_LINK = 'https://theplot.tv/taste-match';

/** Below this many titles you have both rated, a match % is noise. */
export const MIN_SHARED_RATINGS = 5;

/** Both rated it at least this (on the 1-10 scale): 4 stars and up. */
const LOVED_MIN = 8;
/** A rating gap of at least this (1-10 scale) counts as a disagreement: 2 stars. */
const DISAGREE_MIN = 4;
/** Average-star gaps smaller than this call the critics even. */
const CRITIC_EVEN = 0.1;

/**
 * One row per title. When a title appears more than once, a rated row beats an
 * unrated one; otherwise the first seen wins (the RPC already orders newest first).
 * @param {any[]} rows
 * @returns {Map<string, any>}
 */
export function byTitle(rows) {
  const out = new Map();
  for (const r of rows || []) {
    const key = detailsKey(r);
    const prev = out.get(key);
    if (!prev || (!normalizeRating(prev.rating) && normalizeRating(r.rating))) out.set(key, r);
  }
  return out;
}

/**
 * 0-100: how closely your ratings agree on titles you have both rated. 100 is
 * identical ratings; 0 is the widest possible gap (1 vs 10) on every title.
 * @param {Array<{ mine: number, theirs: number }>} pairs ratings on the 1-10 scale
 * @returns {number | null} null below MIN_SHARED_RATINGS
 */
export function matchPercent(pairs) {
  if (!pairs || pairs.length < MIN_SHARED_RATINGS) return null;
  const maxGap = MAX_RATING - 1;
  const meanGap = pairs.reduce((s, p) => s + Math.abs(p.mine - p.theirs), 0) / pairs.length;
  return Math.round(100 * (1 - meanGap / maxGap));
}

/**
 * The decade most of these titles were released in; ties go to the more recent.
 * @param {any[]} rows
 * @returns {number | null} e.g. 1990
 */
export function favouriteDecade(rows) {
  const counts = new Map();
  for (const r of rows) {
    const m = typeof r.release_date === 'string' ? /^(\d{4})/.exec(r.release_date) : null;
    if (!m) continue;
    const decade = Math.floor(Number(m[1]) / 10) * 10;
    counts.set(decade, (counts.get(decade) || 0) + 1);
  }
  let best = null, bestCount = 0;
  for (const [decade, count] of counts) {
    if (count > bestCount || (count === bestCount && decade > best)) { best = decade; bestCount = count; }
  }
  return best;
}

/**
 * Share of each person's titles in each genre, top `limit` by combined share.
 * Percentages are whole numbers of that person's own titles, so they do not sum
 * to 100 (a title has several genres).
 * @param {any[]} mine @param {any[]} theirs
 * @returns {Array<{ id: number, mine: number, theirs: number }>}
 */
export function genreSplit(mine, theirs, limit = 5) {
  const pct = (rows) => {
    const m = new Map();
    if (!rows.length) return m;
    for (const g of genreCounts(rows)) m.set(g.id, Math.round((g.count / rows.length) * 100));
    return m;
  };
  const a = pct(mine), b = pct(theirs);
  const ids = new Set([...a.keys(), ...b.keys()]);
  return [...ids]
    .map(id => ({ id, mine: a.get(id) || 0, theirs: b.get(id) || 0 }))
    .sort((x, y) => (y.mine + y.theirs) - (x.mine + x.theirs) || x.id - y.id)
    .slice(0, limit);
}

/**
 * The genre you both lean into most: the highest of the lower share.
 * @param {Array<{ id: number, mine: number, theirs: number }>} split
 */
export function sharedTopGenreId(split) {
  let best = null;
  for (const g of split) {
    const both = Math.min(g.mine, g.theirs);
    if (both > 0 && (!best || both > best.both)) best = { id: g.id, both };
  }
  return best?.id ?? null;
}

/**
 * @typedef {object} TasteTitle
 * @property {number} tmdb_id
 * @property {string} media_type
 * @property {string} title
 * @property {string | null} poster_path
 * @property {number} mine   your rating, 1-10
 * @property {number} theirs their rating, 1-10
 */

/**
 * @typedef {object} TasteOverlap
 * @property {{ mine: number, theirs: number, both: number }} watched
 *   distinct titles each has watched, and how many of those overlap
 * @property {number} sharedRated titles you have both rated
 * @property {number | null} match 0-100, null below MIN_SHARED_RATINGS
 * @property {Array<{ id: number, mine: number, theirs: number }>} genres
 * @property {number | null} sharedGenreId
 * @property {{ mine: number | null, theirs: number | null }} decades
 * @property {{ mine: number | null, theirs: number | null, tougher: 'mine' | 'theirs' | 'even' | null }} critic
 *   average stars (0-5) across all of each person's rated titles; `tougher` is
 *   who rates lower
 * @property {TasteTitle[]} loved     both rated 4 stars or more, best first
 * @property {TasteTitle[]} disagree  rated 2+ stars apart, widest gap first
 */

/**
 * @param {any[]} mineRows the viewer's history
 * @param {any[]} theirRows the other person's history
 * @param {{ lovedLimit?: number, disagreeLimit?: number }} [opts]
 * @returns {TasteOverlap}
 */
export function tasteOverlap(mineRows, theirRows, { lovedLimit = 3, disagreeLimit = 3 } = {}) {
  const mine = byTitle(mineRows), theirs = byTitle(theirRows);
  const mineList = [...mine.values()], theirList = [...theirs.values()];

  let both = 0;
  /** @type {TasteTitle[]} */
  const rated = [];
  for (const [key, m] of mine) {
    const t = theirs.get(key);
    if (!t) continue;
    both++;
    const a = normalizeRating(m.rating), b = normalizeRating(t.rating);
    if (a && b) {
      rated.push({
        tmdb_id: m.tmdb_id, media_type: m.media_type || 'movie', title: m.title || t.title,
        poster_path: m.poster_path || t.poster_path || null, mine: a, theirs: b,
      });
    }
  }

  const loved = rated
    .filter(r => r.mine >= LOVED_MIN && r.theirs >= LOVED_MIN)
    .sort((x, y) => (y.mine + y.theirs) - (x.mine + x.theirs) || x.title.localeCompare(y.title))
    .slice(0, lovedLimit);
  const disagree = rated
    .filter(r => Math.abs(r.mine - r.theirs) >= DISAGREE_MIN)
    .sort((x, y) => Math.abs(y.mine - y.theirs) - Math.abs(x.mine - x.theirs) || x.title.localeCompare(y.title))
    .slice(0, disagreeLimit);

  const avgMine = averageStars(mineList)?.stars ?? null;
  const avgTheirs = averageStars(theirList)?.stars ?? null;
  let tougher = null;
  if (avgMine != null && avgTheirs != null) {
    tougher = Math.abs(avgMine - avgTheirs) < CRITIC_EVEN ? 'even' : avgMine < avgTheirs ? 'mine' : 'theirs';
  }

  const genres = genreSplit(mineList, theirList);
  return {
    watched: { mine: mine.size, theirs: theirs.size, both },
    sharedRated: rated.length,
    match: matchPercent(rated),
    genres,
    sharedGenreId: sharedTopGenreId(genres),
    decades: { mine: favouriteDecade(mineList), theirs: favouriteDecade(theirList) },
    critic: { mine: avgMine, theirs: avgTheirs, tougher },
    loved,
    disagree,
  };
}


/**
 * A made-up comparison for the picker to show before anyone is chosen, in the
 * shape tasteOverlap() returns. Genre ids are 1-based positions in
 * TASTE_OVERLAP.exampleGenres, never TMDB ids, and it carries no titles: a
 * sample must not name or draw a film nobody looked up. exampleOverlap() adds
 * titles that came from a TMDB response.
 */
export const EXAMPLE_OVERLAP = Object.freeze({
  watched: { mine: 212, theirs: 164, both: 88 },
  sharedRated: 41,
  match: 82,
  genres: [
    { id: 1, mine: 34, theirs: 29 },
    { id: 2, mine: 18, theirs: 27 },
    { id: 3, mine: 21, theirs: 12 },
  ],
  sharedGenreId: 1,
  decades: { mine: 2010, theirs: 1990 },
  critic: { mine: 3.8, theirs: 3.2, tougher: /** @type {'theirs'} */ ('theirs') },
  loved: [],
  disagree: [],
});

/** How many titles the sample says are on both watchlists. */
export const EXAMPLE_SHARED_WATCHLIST = 14;

// Made-up ratings (10-point, as stored) for the sample's titles, in order:
// six both people loved, then three they disagree on.
const EXAMPLE_LOVED = [[10, 9], [9, 10], [9, 9], [8, 10], [10, 8], [8, 9]];
const EXAMPLE_DISAGREE = [[9, 3], [4, 10], [8, 2]];

/**
 * The sample comparison with "You both loved" and "Where you disagree" filled
 * in, so it shows everything a real one between two full profiles would.
 * `titles` must come from a TMDB response (the picker passes this week's
 * trending list); the ratings laid over them are invented. With too few
 * titles a section stays empty and the views leave it out.
 *
 * @param {Array<{ tmdb_id: number, media_type: string, title: string, poster_path: string | null }>} [titles]
 */
export function exampleOverlap(titles = []) {
  const usable = titles.filter(t => t && t.tmdb_id != null && t.title && t.poster_path);
  const rate = (pairs, offset) => pairs.flatMap(([mine, theirs], i) => {
    const t = usable[offset + i];
    return t ? [{ tmdb_id: t.tmdb_id, media_type: t.media_type || 'movie', title: t.title, poster_path: t.poster_path, mine, theirs }] : [];
  });
  return {
    ...EXAMPLE_OVERLAP,
    loved: rate(EXAMPLE_LOVED, 0),
    disagree: rate(EXAMPLE_DISAGREE, EXAMPLE_LOVED.length),
  };
}

/** The most characters of a name the overlap circles have room for. */
export const VENN_NAME_MAX = 9;

/**
 * A person's name as drawn inside their circle. The space between the
 * overlap and the circle's edge is about 60 of the drawing's 300 units, which
 * at the label's size holds nine characters; a longer name used to run over
 * the circle's edge. The full name is still what a screen reader hears.
 * @param {string | null | undefined} name
 * @returns {string}
 */
export function vennName(name) {
  const chars = Array.from(String(name || '').trim());
  if (chars.length <= VENN_NAME_MAX) return chars.join('');
  return `${chars.slice(0, VENN_NAME_MAX - 1).join('').trimEnd()}…`;
}

/**
 * Genre names for EXAMPLE_OVERLAP, keyed the way the comparison views expect.
 * @param {string[]} names TASTE_OVERLAP.exampleGenres
 * @returns {Map<number, string>}
 */
export function exampleGenreNames(names) {
  return new Map(names.map((name, index) => [index + 1, name]));
}

/**
 * Who you can compare with: anyone public, or anyone private who has accepted
 * your follow. Mirrors the RPC's visibility test; the RPC is the authority.
 * @param {{ is_public?: boolean | null, follow_status?: string | null }} person
 */
export function canCompare(person) {
  return !!person && (!!person.is_public || person.follow_status === 'accepted');
}

/**
 * Whether a comparison is open to this viewer. Premium on either side unlocks
 * it (taste_overlap, 20261118140000), and the client cannot see the other
 * person's subscription, so it always asks: only the server's
 * `premium_required` refusal shows the upsell. While loading it reads as
 * open, so a Free viewer comparing with a Premium member never sees the
 * upsell flash first.
 * @param {string | null | undefined} error the useTasteOverlap error
 */
export function compareUnlocked(error) {
  return error !== 'premium_required';
}

/**
 * Share card grounds, all from the shared tokens. Charcoal uses the dark
 * surface rather than the near-black page ground so the panels still read.
 * `hero`/`heroInk` are the solid panel the headline number sits on.
 */
export const SHARE_CARD_THEMES = {
  cream: {
    ground: colors.light.bg, ink: colors.light.textPrimary, soft: colors.light.textSecondary,
    panel: colors.light.surface, panelInk: colors.light.textPrimary, kicker: colors.light.accentText,
    meFill: colors.light.accentFill,
    hero: colors.light.surfaceRaised, heroInk: colors.light.textPrimary,
  },
  pink: {
    ground: colors.light.accentFill, ink: colors.light.onAccentFill, soft: colors.light.textPrimary,
    panel: colors.light.surface, panelInk: colors.light.textPrimary, kicker: colors.light.onAccentFill,
    // The pink avatar would vanish into a pink ground.
    meFill: colors.light.surface,
    hero: colors.light.surface, heroInk: colors.light.textPrimary,
  },
  charcoal: {
    ground: colors.dark.surface, ink: colors.dark.textPrimary, soft: colors.dark.textSecondary,
    panel: colors.dark.surfaceRaised, panelInk: colors.dark.textPrimary, kicker: colors.dark.accentText,
    meFill: colors.light.accentFill,
    hero: colors.dark.surfaceRaised, heroInk: colors.dark.textPrimary,
  },
};

/**
 * Whether the share card may carry the other person's name. It goes to social
 * media without their say, so only a name they already show the world
 * (a public profile) is allowed; everyone else is "a friend". Decided with
 * Savannah on 2026-09-25.
 * @param {{ is_public?: boolean | null } | null | undefined} target
 */
export function canNameOnShareCard(target) {
  return !!target?.is_public;
}

/**
 * What the share card says. `friendName` is null unless the sharer asked for
 * it AND canNameOnShareCard allows it.
 * @param {TasteOverlap} overlap
 * @param {{ display_name?: string | null, username?: string | null, is_public?: boolean | null }} target
 * @param {{ showName?: boolean }} [opts]
 */
export function shareCardContent(overlap, target, { showName = false } = {}) {
  const name = target?.display_name || target?.username || null;
  const friendName = showName && canNameOnShareCard(target) ? name : null;
  const argument = overlap.disagree[0] || null;
  return {
    friendName,
    match: overlap.match,
    watchedInCommon: overlap.watched.both,
    loved: overlap.loved.slice(0, 3),
    sharedGenreId: overlap.sharedGenreId,
    biggestArgument: argument ? argument.title : null,
  };
}
