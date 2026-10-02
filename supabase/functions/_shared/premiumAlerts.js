// Detection rules for the Premium alerts job (supabase/functions/premium-alerts).
//
// Pure functions over TMDB response shapes, so the rules that decide whether
// someone is told something can be tested with node --test
// (apps/web/tests/unit/premiumAlerts.test.js) without Deno, a database or TMDB.
//
// The bar for both alerts is the same: a false alert is worse than a late one.
// Anything these functions cannot establish from the data comes back null, and
// null means "say nothing this run".
//
// Episode release notifications (#1032's new_episode) are a separate, Free
// feature with their own job. Nothing here fires on an episode airing.

/** UTC calendar date `days` before `from`, as YYYY-MM-DD. @param {Date} from @param {number} [days] */
export function isoDay(from, days = 0) {
  const d = new Date(Date.UTC(from.getUTCFullYear(), from.getUTCMonth(), from.getUTCDate() - days));
  return d.toISOString().slice(0, 10);
}

/** @param {unknown} value @returns {string | null} YYYY-MM-DD or null */
function dateOnly(value) {
  if (typeof value !== 'string') return null;
  const day = value.slice(0, 10);
  return /^\d{4}-\d{2}-\d{2}$/.test(day) ? day : null;
}

// ── Following people: the feed and its release-day alerts ────────────────────
//
// What counts (Savannah's round 2 decision): films a person is billed in the
// top 12 of, or directed; series they are a regular in, or created, including
// each new season (a whole drop or weekly). One update per title, or per
// season. Playing yourself, talk shows, news and reality never count.
//
// packages/core/peopleFeed.js applies the same appearance rule on the client
// (the Coming up strip on a person's page); apps/web/tests/unit/peopleRules.test.js
// keeps the two in step.

// How far back a release still counts as new for an alert. The job runs daily;
// three days lets a missed run or two heal, and the dedupe key stops repeats.
export const PEOPLE_LOOK_BACK_DAYS = 3;
// The feed's window: recent enough to be "out now", far enough ahead to show
// what is dated. Films outside it are not looked up at all.
export const FEED_PAST_DAYS = 45;
export const FEED_FUTURE_DAYS = 730;
// Billing order past which an acting credit is a bit part, not "their new film".
export const MAX_CAST_ORDER = 12;
// A series regular: this many episodes or more. A brand-new or announced
// series counts on any episode count, because TMDB lists far fewer before it airs.
export const REGULAR_MIN_EPISODES = 3;
const NEW_SERIES_DAYS = 120;
// Shows that started this long ago are not checked for new seasons: it bounds
// the job's TMDB calls, at the cost of very long-running shows.
const SHOW_HORIZON_YEARS = 15;
// TMDB genres that are appearances rather than roles: News, Reality, Talk.
const APPEARANCE_GENRES = new Set([10763, 10764, 10767]);
const SELF_ROLE = /\b(self|himself|herself|themselves|themself)\b/i;

/** Days between two YYYY-MM-DD dates (b - a). @param {string} a @param {string} b */
function dayDiff(a, b) {
  return Math.round((Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / 86400000);
}

/** An appearance, not a role: playing yourself, or a talk, news or reality show. @param {any} credit */
export function isAppearance(credit) {
  if ((credit?.genre_ids ?? []).some((/** @type {number} */ g) => APPEARANCE_GENRES.has(g))) return true;
  return SELF_ROLE.test(String(credit?.character ?? ''));
}

/**
 * Which part a followed person plays in a credit worth following, or null.
 *
 * @param {any} credit one entry from /person/{id}/combined_credits cast or crew
 * @param {'cast' | 'crew'} list which array it came from
 * @param {string} [today] YYYY-MM-DD; lets a new series count before it has episodes
 * @returns {'cast' | 'director' | 'creator' | null}
 */
export function creditRole(credit, list, today) {
  if (!credit || typeof credit.id !== 'number') return null;
  if (credit.media_type !== 'movie' && credit.media_type !== 'tv') return null;
  if (isAppearance(credit)) return null;
  if (list === 'cast') {
    if (credit.media_type === 'movie') {
      return typeof credit.order === 'number' && credit.order > MAX_CAST_ORDER ? null : 'cast';
    }
    const episodes = typeof credit.episode_count === 'number' ? credit.episode_count : 0;
    const first = dateOnly(credit.first_air_date);
    const isNew = !first || (today ? dayDiff(first, today) <= NEW_SERIES_DAYS : false);
    return episodes >= REGULAR_MIN_EPISODES || isNew ? 'cast' : null;
  }
  if (credit.media_type === 'movie' && credit.job === 'Director') return 'director';
  if (credit.media_type === 'tv' && credit.job === 'Creator') return 'creator';
  return null;
}

const ROLE_RANK = { director: 0, creator: 1, cast: 2 };

/**
 * @typedef {object} CreditCandidate
 * @property {number} tmdbId
 * @property {'movie' | 'tv'} mediaType
 * @property {string} title
 * @property {string | null} posterPath
 * @property {'cast' | 'director' | 'creator'} role
 * @property {string | null} character
 * @property {string | null} primaryDate  release_date / first_air_date
 */

/**
 * The titles in a person's credits worth looking at closer. Films need a date
 * inside the feed window. Shows need a qualifying role and are then checked
 * season by season with showSeasons(), since a new season of an old show is
 * exactly what this should catch. One entry per title; a director who also
 * acts is reported as the director.
 *
 * @param {any} credits /person/{id}/combined_credits body
 * @param {string} today YYYY-MM-DD
 * @returns {{ films: CreditCandidate[], shows: CreditCandidate[] }}
 */
export function feedCandidates(credits, today) {
  /** @type {Map<string, CreditCandidate>} */
  const byTitle = new Map();
  const showHorizon = `${Number(today.slice(0, 4)) - SHOW_HORIZON_YEARS}${today.slice(4)}`;
  for (const [list, entries] of /** @type {const} */ ([['cast', credits?.cast], ['crew', credits?.crew]])) {
    for (const credit of entries ?? []) {
      const role = creditRole(credit, list, today);
      if (!role) continue;
      const primaryDate = dateOnly(credit.media_type === 'movie' ? credit.release_date : credit.first_air_date);
      if (credit.media_type === 'movie') {
        if (!primaryDate) continue;
        const d = dayDiff(today, primaryDate);
        if (d < -FEED_PAST_DAYS || d > FEED_FUTURE_DAYS) continue;
      } else if (primaryDate && primaryDate < showHorizon) {
        continue;
      }
      const title = credit.title ?? credit.name;
      if (typeof title !== 'string' || !title) continue;
      const key = `${credit.media_type}:${credit.id}`;
      const existing = byTitle.get(key);
      if (existing && ROLE_RANK[existing.role] <= ROLE_RANK[role]) continue;
      byTitle.set(key, {
        tmdbId: credit.id,
        mediaType: credit.media_type,
        title,
        posterPath: typeof credit.poster_path === 'string' ? credit.poster_path : null,
        role,
        character: role === 'cast' && typeof credit.character === 'string' && credit.character ? credit.character : null,
        primaryDate,
      });
    }
  }
  const all = [...byTitle.values()];
  return { films: all.filter(c => c.mediaType === 'movie'), shows: all.filter(c => c.mediaType === 'tv') };
}

// TMDB release types: 1 premiere, 2 limited theatrical, 3 theatrical,
// 4 digital, 5 physical, 6 TV. Only a general cinema or digital release counts
// as "out": a premiere or a limited run is not something most people can see.
const RELEASE_KINDS = /** @type {Record<number, 'theatrical' | 'digital'>} */ ({ 3: 'theatrical', 4: 'digital' });

/**
 * Each region's first general release (theatrical or digital) of a film. The
 * first one is the one that counts: one alert per title, on the day it first
 * becomes something you can go and see.
 *
 * @param {any} releaseDates /movie/{id}/release_dates body
 * @returns {Record<string, { kind: 'theatrical' | 'digital', date: string }>}
 */
export function regionalReleases(releaseDates) {
  /** @type {Record<string, { kind: 'theatrical' | 'digital', date: string }>} */
  const out = {};
  for (const entry of releaseDates?.results ?? []) {
    const region = entry?.iso_3166_1;
    if (typeof region !== 'string' || !/^[A-Z]{2}$/.test(region)) continue;
    for (const release of entry?.release_dates ?? []) {
      const kind = RELEASE_KINDS[release?.type];
      const date = dateOnly(release?.release_date);
      if (!kind || !date) continue;
      if (!out[region] || date < out[region].date) out[region] = { kind, date };
    }
  }
  return out;
}

/**
 * A film's first general release in one region, if it falls in the window.
 * No entry for the region means no alert: the primary date alone does not say
 * the film is out where the person lives.
 *
 * @param {any} releaseDates /movie/{id}/release_dates body
 * @param {string} region ISO 3166-1, e.g. 'AU'
 * @param {{ today: string, since: string }} window YYYY-MM-DD, inclusive
 * @returns {{ kind: 'theatrical' | 'digital', date: string } | null}
 */
export function regionalMovieRelease(releaseDates, region, { today, since }) {
  const first = regionalReleases(releaseDates)[region];
  if (!first || first.date < since || first.date > today) return null;
  return first;
}

/**
 * The seasons of a show worth putting in the feed: numbered seasons with an
 * air date inside the feed window. Season 1 is the series itself.
 *
 * @param {any} details /tv/{id} body
 * @param {string} today YYYY-MM-DD
 * @returns {Array<{ season: number, kind: 'series' | 'season', date: string, episodeCount: number | null, network: string | null }>}
 */
export function showSeasons(details, today) {
  const network = typeof details?.networks?.[0]?.name === 'string' ? details.networks[0].name : null;
  const out = [];
  for (const s of details?.seasons ?? []) {
    const season = s?.season_number;
    const date = dateOnly(s?.air_date);
    if (typeof season !== 'number' || season < 1 || !date) continue;
    const d = dayDiff(today, date);
    if (d < -FEED_PAST_DAYS || d > FEED_FUTURE_DAYS) continue;
    out.push({
      season,
      kind: /** @type {'series' | 'season'} */ (season === 1 ? 'series' : 'season'),
      date,
      episodeCount: typeof s.episode_count === 'number' ? s.episode_count : null,
      network,
    });
  }
  return out;
}

/**
 * How many episodes came out on the premiere day: the whole season for a
 * drop, 1 for a weekly release.
 * @param {any} seasonBody /tv/{id}/season/{n} body
 * @param {string} premiere YYYY-MM-DD
 */
export function premiereDrop(seasonBody, premiere) {
  return (seasonBody?.episodes ?? []).filter((/** @type {any} */ e) => dateOnly(e?.air_date) === premiere).length || 1;
}

/**
 * Feed row → the date and kind of release for one viewer, or null when there is
 * nothing to say for their region. Films use the viewer's own regional release;
 * a show's season dates are the same everywhere TMDB knows them.
 *
 * @param {{ media_type: string, kind: string, release_date?: string | null, regional_releases?: Record<string, { kind: string, date: string }> }} row
 * @param {string} region
 * @returns {{ kind: 'theatrical' | 'digital' | 'premiere' | 'season', date: string } | null}
 */
export function releaseForRegion(row, region) {
  if (row.media_type === 'movie') {
    const r = row.regional_releases?.[region];
    return r && (r.kind === 'theatrical' || r.kind === 'digital') ? { kind: r.kind, date: r.date } : null;
  }
  if (!row.release_date) return null;
  return { kind: row.kind === 'series' ? 'premiere' : 'season', date: row.release_date };
}

/**
 * One alert per title (and per season of a show).
 * @param {'movie' | 'tv'} mediaType @param {number} tmdbId @param {number} [season]
 */
export const personReleaseKey = (mediaType, tmdbId, season = 0) =>
  season > 1 ? `person_release:${mediaType}:${tmdbId}:s${season}` : `person_release:${mediaType}:${tmdbId}`;

// ── Whole-season-ready alerts ─────────────────────────────────────────────────

// A season that finished longer ago than this is not "newly ready": the alert
// is for waiting on a season, not for discovering an old one.
export const SEASON_READY_HORIZON_DAYS = 180;
const FINISHED_STATUSES = new Set(['Ended', 'Canceled']);

/**
 * The show's latest season, if TMDB says it has finished airing. Finished
 * means one of: its last episode is marked as the finale, the show has ended
 * or been cancelled, or the next episode belongs to a later season. A season
 * on a mid-season break, or one whose finale is simply unannounced, is not
 * finished, and so gets no alert.
 *
 * @param {any} show /tv/{id} details body
 * @param {string} today YYYY-MM-DD
 * @returns {{ season: number, episodeCount: number, finaleDate: string } | null}
 */
export function finishedSeason(show, today) {
  const last = show?.last_episode_to_air;
  const season = last?.season_number;
  if (typeof season !== 'number' || season < 1) return null;
  const next = show?.next_episode_to_air;
  if (next && typeof next.season_number === 'number' && next.season_number <= season) return null;
  const finished = last.episode_type === 'finale'
    || FINISHED_STATUSES.has(show?.status)
    || (next != null && typeof next.season_number === 'number' && next.season_number > season);
  if (!finished) return null;
  const finaleDate = dateOnly(last.air_date);
  if (!finaleDate || finaleDate >= today) return null;
  const oldest = isoDay(new Date(`${today}T00:00:00Z`), SEASON_READY_HORIZON_DAYS);
  if (finaleDate < oldest) return null;
  const meta = (show?.seasons ?? []).find((/** @type {any} */ s) => s?.season_number === season);
  const episodeCount = typeof meta?.episode_count === 'number' ? meta.episode_count : 0;
  if (episodeCount < 1) return null;
  return { season, episodeCount, finaleDate };
}

/**
 * Every episode of the season has aired, and TMDB's episode list is as long as
 * the season says it is. A list with gaps, or an episode with no date, fails.
 *
 * @param {any} seasonBody /tv/{id}/season/{n} body
 * @param {number} episodeCount from the show details' seasons[]
 * @param {string} today YYYY-MM-DD
 */
export function seasonFullyAired(seasonBody, episodeCount, today) {
  const episodes = Array.isArray(seasonBody?.episodes) ? seasonBody.episodes : [];
  if (!episodes.length || episodes.length < episodeCount) return false;
  const numbers = new Set(episodes.map((/** @type {any} */ e) => e?.episode_number));
  for (let n = 1; n <= episodeCount; n++) if (!numbers.has(n)) return false;
  return episodes.every((/** @type {any} */ e) => {
    const date = dateOnly(e?.air_date);
    return date !== null && date < today;
  });
}

/**
 * The person's selected services that carry the season in their region, by
 * TMDB's season-level watch providers (JustWatch data). Subscription, free and
 * free-with-ads count; rent and buy do not, because "ready on your services"
 * means ready to watch with what you already pay for.
 *
 * @param {any} providersBody /tv/{id}/season/{n}/watch/providers body
 * @param {string} region ISO 3166-1
 * @param {number[]} selectedIds TMDB provider ids from profile.streaming_providers
 * @returns {Array<{ id: number, name: string }>}
 */
export function readyOnSelectedServices(providersBody, region, selectedIds) {
  const wanted = new Set(selectedIds);
  if (!wanted.size) return [];
  const bucket = providersBody?.results?.[region];
  /** @type {Map<number, string>} */
  const found = new Map();
  for (const key of ['flatrate', 'free', 'ads']) {
    for (const p of bucket?.[key] ?? []) {
      if (typeof p?.provider_id === 'number' && wanted.has(p.provider_id) && !found.has(p.provider_id)) {
        found.set(p.provider_id, typeof p.provider_name === 'string' ? p.provider_name : '');
      }
    }
  }
  return [...found].filter(([, name]) => name).map(([id, name]) => ({ id, name }));
}

/** @param {number} tmdbId @param {number} season */
export const seasonReadyKey = (tmdbId, season) => `season_ready:tv:${tmdbId}:s${season}`;

// ── Shared ────────────────────────────────────────────────────────────────────

/**
 * TMDB provider ids from profile.streaming_providers (entries are
 * `{ id, name, ... }`; anything without a positive numeric id is ignored).
 * Mirrors pickerProviderIds in packages/core/tonightPicker.js.
 * @param {unknown} streamingProviders
 * @returns {number[]}
 */
export function selectedProviderIds(streamingProviders) {
  if (!Array.isArray(streamingProviders)) return [];
  return [...new Set(streamingProviders
    .map(p => Number(p?.id))
    .filter(id => Number.isFinite(id) && id > 0))];
}

/** Viewer region with the app's default (packages/core/regions.js DEFAULT_REGION). @param {unknown} region */
export function alertRegion(region) {
  return typeof region === 'string' && /^[A-Za-z]{2}$/.test(region) ? region.toUpperCase() : 'US';
}
