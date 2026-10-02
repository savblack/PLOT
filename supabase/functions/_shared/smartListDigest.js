// The weekly smart lists roll-up (supabase/functions/smart-list-digest), as
// pure functions so the rules can be tested with node --test
// (apps/web/tests/unit/smartListDigest.test.js) without Deno, a database or TMDB.
//
// Edge functions cannot import @plot/core (it pulls in the browser Supabase
// client and the TMDB proxy), so the few pieces of smart list logic the job
// needs are restated here. They are the ones that decide what a list finds:
// the rules' cleaning and the TMDB discover query. The unit test checks both
// against packages/core/smartLists.js and tonightPicker.js on a spread of
// rules, so the server and the app cannot drift apart unnoticed.
//
// What the job does with a list, once a week:
//   - discover lists only. A watchlist or history list changes when its owner
//     saves or watches something, which they already know about.
//   - one page of TMDB discover per media type, the same first page the app
//     opens the list on, minus watched titles when the rules say so.
//   - a title is new when it is in neither seen_keys (shown at the last open)
//     nor pending_keys (already counted by an earlier roll-up).
//   - a list never opened gets its first page recorded and counts nothing.
// One notification per person per ISO week, and only when something is new.

const thisYear = (now) => now.getUTCFullYear();

/** Mirrors PICKER_ERAS (packages/core/tonightPicker.js). */
const ERAS = {
  any: () => ({ gte: null, lte: null }),
  recent: (now) => ({ gte: `${thisYear(now) - 2}-01-01`, lte: null }),
  '2010s': () => ({ gte: '2010-01-01', lte: '2019-12-31' }),
  '2000s': () => ({ gte: '2000-01-01', lte: '2009-12-31' }),
  '1990s': () => ({ gte: '1990-01-01', lte: '1999-12-31' }),
  classic: () => ({ gte: null, lte: '1989-12-31' }),
};
// Mirrors tonightPicker.js and smartLists.js.
const MIN_SCORES = [null, 6, 7, 8];
const MOVIE_RUNTIMES = [90, 120, 150, null];
const EPISODE_RUNTIMES = [30, 45, 60, null];
const SOURCES = ['discover', 'watchlist', 'history'];
const MEDIA_TYPES = ['any', 'movie', 'tv'];
const MIN_FEATURE_RUNTIME = 60;
const MIN_EPISODE_RUNTIME = 15;
const MIN_VOTES = { movie: 20, tv: 50 };
const MIN_VOTES_WITH_SCORE = { movie: 150, tv: 100 };
const TV_TYPES_ANY = '0|2|4';
const TV_EXCLUDED_GENRES = [10763, 10767, 10766];
const KIDS_GENRE_IDS = [10751, 10762];

export const SEEN_CAP = 1000;
export const PENDING_CAP = 200;
/** Posters shown stacked on the notification row. */
export const DIGEST_POSTERS = 3;

const pick = (value, allowed, fallback) => (allowed.includes(value) ? value : fallback);

/**
 * Smart list rules as stored, cleaned the way normalizeSmartListRules
 * (packages/core/smartLists.js) cleans them. Null for a manual list.
 * @param {any} raw
 */
export function cleanRules(raw) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const source = pick(raw.source, SOURCES, 'discover');
  const mediaType = pick(raw.mediaType, MEDIA_TYPES, 'movie');
  const runtimes = mediaType === 'tv' ? EPISODE_RUNTIMES : MOVIE_RUNTIMES;
  const genreIds = Array.isArray(raw.genreIds)
    ? [...new Set(raw.genreIds.map(Number).filter(id => Number.isInteger(id) && id > 0))].slice(0, 20)
    : [];
  return {
    v: 1,
    source,
    mediaType,
    genreIds,
    era: pick(raw.era, Object.keys(ERAS), 'any'),
    minScore: pick(raw.minScore ?? null, MIN_SCORES, null),
    maxRuntime: mediaType === 'any' ? null : pick(raw.maxRuntime ?? null, runtimes, null),
    onlyServices: !!raw.onlyServices,
    minMyRating: source === 'history' ? pick(raw.minMyRating ?? null, [null, 6, 8, 10], null) : null,
    hideWatched: source === 'history' ? false : raw.hideWatched !== false,
  };
}

/** @param {{ mediaType: string }} rules @returns {Array<'movie'|'tv'>} */
export const rulesTypes = (rules) => (rules.mediaType === 'any' ? ['movie', 'tv'] : [rules.mediaType]);

/** Whether picking these genres is asking for family or kids titles. */
const asksForKids = (rules) => rules.genreIds.some(id => KIDS_GENRE_IDS.includes(id));

/**
 * The TMDB /discover query for one media type: the same parameters the app
 * sends for page 1 (discoverParams(smartListPickerOptions(rules, type))).
 * @param {ReturnType<typeof cleanRules>} rules
 * @param {'movie'|'tv'} type
 * @param {{ providerIds: number[], region: string, hideKids: boolean, now?: Date }} ctx
 */
export function discoverQuery(rules, type, { providerIds, region, hideKids, now = new Date() }) {
  const tv = type === 'tv';
  const kids = hideKids && !asksForKids(rules);
  const { gte, lte } = ERAS[rules.era](now);
  const dateKey = tv ? 'first_air_date' : 'primary_release_date';
  const without = [...(tv ? TV_EXCLUDED_GENRES : []), ...(kids ? KIDS_GENRE_IDS : [])];
  /** @type {Record<string, string|number>} */
  const params = {
    sort_by: 'popularity.desc',
    'vote_count.gte': rules.minScore ? MIN_VOTES_WITH_SCORE[type] : MIN_VOTES[type],
    page: 1,
  };
  const maxRuntime = rules.maxRuntime;
  if (tv) {
    params['with_runtime.gte'] = MIN_EPISODE_RUNTIME;
    if (maxRuntime) params['with_runtime.lte'] = maxRuntime;
    params.with_type = TV_TYPES_ANY;
  } else {
    params['with_runtime.gte'] = MIN_FEATURE_RUNTIME;
    if (maxRuntime) params['with_runtime.lte'] = maxRuntime;
  }
  if (rules.genreIds.length) params.with_genres = rules.genreIds.join('|');
  if (without.length) params.without_genres = [...new Set(without)].join(',');
  if (gte) params[`${dateKey}.gte`] = gte;
  if (lte) params[`${dateKey}.lte`] = lte;
  if (rules.minScore) params['vote_average.gte'] = rules.minScore;
  if (rules.onlyServices) {
    params.watch_region = region;
    params.with_watch_providers = providerIds.join('|');
    params.with_watch_monetization_types = 'flatrate';
  }
  return params;
}

/** "movie:123" / "tv:456", the key the app uses (packages/core/smartListSeen.js). */
export const matchKey = (type, id) => `${type === 'tv' ? 'tv' : 'movie'}:${id}`;

/**
 * Keys and posters from one discover page, as the app would show them: a
 * poster, no family or kids titles when hidden, nothing already watched.
 * @param {any[]} results
 * @param {'movie'|'tv'} type
 * @param {{ rules: ReturnType<typeof cleanRules>, hideKids: boolean, watched: Set<string> }} ctx
 * @returns {Array<{ key: string, poster_path: string }>}
 */
export function pageMatches(results, type, { rules, hideKids, watched }) {
  const kids = hideKids && !asksForKids(rules);
  const out = [];
  const seen = new Set();
  for (const r of results || []) {
    if (!r?.id || !r.poster_path) continue;
    if (kids && (r.genre_ids || []).some(id => KIDS_GENRE_IDS.includes(id))) continue;
    const key = matchKey(type, r.id);
    if (seen.has(key)) continue;
    seen.add(key);
    if (rules.hideWatched && watched.has(key)) continue;
    out.push({ key, poster_path: r.poster_path });
  }
  return out;
}

/** Newer first, no repeats, capped. @param {string[]} newer @param {string[]} older @param {number} cap */
export function mergeKeys(newer, older, cap) {
  return [...new Set([...(newer || []), ...(older || [])])].slice(0, cap);
}

/**
 * What one list's run means for its seen row and the roll-up.
 * @param {string[]} keys matches found now, in page order
 * @param {{ seen_keys?: string[] | null, pending_keys?: string[] | null } | null} row
 * @returns {{ newKeys: string[], next: { seen_keys: string[], pending_keys: string[] } | null }}
 *   next: null when nothing needs writing.
 */
export function listRun(keys, row) {
  if (!row) return { newKeys: [], next: { seen_keys: mergeKeys(keys, [], SEEN_CAP), pending_keys: [] } };
  const known = new Set([...(row.seen_keys || []), ...(row.pending_keys || [])]);
  const newKeys = keys.filter(k => !known.has(k));
  if (!newKeys.length) return { newKeys, next: null };
  return {
    newKeys,
    next: { seen_keys: row.seen_keys || [], pending_keys: mergeKeys(newKeys, row.pending_keys || [], PENDING_CAP) },
  };
}

/**
 * The notification's payload, or null when there is nothing new.
 * @param {Array<{ id: string, name: string, newKeys: string[], posters: Record<string, string> }>} lists
 */
export function buildDigest(lists) {
  const withNew = lists.filter(l => l.newKeys.length > 0)
    .sort((a, b) => b.newKeys.length - a.newKeys.length);
  if (!withNew.length) return null;
  const posters = [];
  for (const l of withNew) {
    for (const key of l.newKeys) {
      const path = l.posters[key];
      if (path && !posters.includes(path)) posters.push(path);
      if (posters.length >= DIGEST_POSTERS) break;
    }
    if (posters.length >= DIGEST_POSTERS) break;
  }
  return {
    count: withNew.reduce((n, l) => n + l.newKeys.length, 0),
    lists: withNew.map(l => ({ id: l.id, name: l.name, count: l.newKeys.length })),
    posters,
  };
}

/**
 * ISO 8601 week, "2026-W40". The roll-up's dedupe key carries it, so a
 * second run in the same week writes nothing.
 * @param {Date} date
 */
export function isoWeek(date) {
  const d = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
  const day = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - day);
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  const week = Math.ceil(((d.getTime() - yearStart.getTime()) / 86400000 + 1) / 7);
  return `${d.getUTCFullYear()}-W${String(week).padStart(2, '0')}`;
}

/** @param {string} week */
export const digestDedupeKey = (week) => `smart_list_digest:${week}`;

/** Selected services' TMDB ids, as pickerProviderIds reads them. @param {any} streamingProviders */
export function providerIdsOf(streamingProviders) {
  if (!Array.isArray(streamingProviders)) return [];
  return [...new Set(streamingProviders.map(p => Number(p?.id)).filter(id => Number.isFinite(id) && id > 0))];
}
