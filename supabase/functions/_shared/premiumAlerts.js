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

// ── Actor and director release alerts ─────────────────────────────────────────

// How far back a release still counts as new. The job runs daily; three days
// lets a missed run or two heal, and the dedupe key stops repeats.
export const PEOPLE_LOOK_BACK_DAYS = 3;
// Movies whose primary (earliest, often festival) date is older than this are
// not checked for a regional release: a wide release rarely trails a premiere
// by more than a few months, and the cap bounds release_dates calls.
export const MOVIE_PREMIERE_HORIZON_DAYS = 180;
// Billing order past which an acting credit is a bit part, not "their new film".
export const MAX_CAST_ORDER = 12;
// TMDB genres that are appearances rather than roles: News, Reality, Talk.
const APPEARANCE_GENRES = new Set([10763, 10764, 10767]);
const SELF_ROLE = /\b(self|himself|herself|themselves|themself)\b/i;

/**
 * Which part a followed person plays in a credit worth an alert, or null.
 * Movies: cast (billed within MAX_CAST_ORDER) or Director. TV: cast, or the
 * show's Creator. Playing yourself, talk shows, news and reality are skipped.
 *
 * @param {any} credit one entry from /person/{id}/combined_credits cast or crew
 * @param {'cast' | 'crew'} list which array it came from
 * @returns {'cast' | 'director' | 'creator' | null}
 */
export function creditRole(credit, list) {
  if (!credit || typeof credit.id !== 'number') return null;
  if (credit.media_type !== 'movie' && credit.media_type !== 'tv') return null;
  if ((credit.genre_ids ?? []).some((/** @type {number} */ g) => APPEARANCE_GENRES.has(g))) return null;
  if (list === 'cast') {
    if (SELF_ROLE.test(String(credit.character ?? ''))) return null;
    if (credit.media_type === 'movie' && typeof credit.order === 'number' && credit.order > MAX_CAST_ORDER) return null;
    return 'cast';
  }
  if (credit.media_type === 'movie' && credit.job === 'Director') return 'director';
  if (credit.media_type === 'tv' && credit.job === 'Creator') return 'creator';
  return null;
}

const ROLE_RANK = { director: 0, creator: 1, cast: 2 };

/**
 * @typedef {object} ReleaseCandidate
 * @property {number} tmdbId
 * @property {'movie' | 'tv'} mediaType
 * @property {string | null} title
 * @property {string | null} posterPath
 * @property {'cast' | 'director' | 'creator'} role
 * @property {string} primaryDate  TMDB's release_date / first_air_date
 */

/**
 * Titles in a person's credits that might have just come out. TV premieres are
 * final here (first_air_date inside the window). Movies are only candidates:
 * their primary date is often a festival premiere, so the job confirms a
 * release in each follower's own region with regionalMovieRelease().
 *
 * One entry per title; a director who also acts is reported as the director.
 *
 * @param {any} credits /person/{id}/combined_credits body
 * @param {{ today: string, since: string }} window YYYY-MM-DD, inclusive
 * @returns {ReleaseCandidate[]}
 */
export function releaseCandidates(credits, { today, since }) {
  const horizon = isoDay(new Date(`${today}T00:00:00Z`), MOVIE_PREMIERE_HORIZON_DAYS);
  const yesterday = isoDay(new Date(`${today}T00:00:00Z`), 1);
  /** @type {Map<string, ReleaseCandidate>} */
  const byTitle = new Map();
  for (const [list, entries] of /** @type {const} */ ([['cast', credits?.cast], ['crew', credits?.crew]])) {
    for (const credit of entries ?? []) {
      const role = creditRole(credit, list);
      if (!role) continue;
      const primaryDate = dateOnly(credit.media_type === 'movie' ? credit.release_date : credit.first_air_date);
      if (!primaryDate) continue;
      // A movie dated today is out today in its region. A TV premiere dated
      // today may be a US evening broadcast that has not aired yet.
      const inRange = credit.media_type === 'movie'
        ? primaryDate >= horizon && primaryDate <= today
        : primaryDate >= since && primaryDate <= yesterday;
      if (!inRange) continue;
      const key = `${credit.media_type}:${credit.id}`;
      const existing = byTitle.get(key);
      if (existing && ROLE_RANK[existing.role] <= ROLE_RANK[role]) continue;
      byTitle.set(key, {
        tmdbId: credit.id,
        mediaType: credit.media_type,
        title: typeof (credit.title ?? credit.name) === 'string' ? (credit.title ?? credit.name) : null,
        posterPath: typeof credit.poster_path === 'string' ? credit.poster_path : null,
        role,
        primaryDate,
      });
    }
  }
  return [...byTitle.values()];
}

// TMDB release types: 1 premiere, 2 limited theatrical, 3 theatrical,
// 4 digital, 5 physical, 6 TV. Only a general cinema or digital release counts
// as "out": a premiere or a limited run is not something most people can see.
const RELEASE_KINDS = /** @type {Record<number, 'theatrical' | 'digital'>} */ ({ 3: 'theatrical', 4: 'digital' });

/**
 * A movie's first general release in one region, if it falls in the window.
 * The first release is the one that counts: a theatrical release three weeks
 * ago means the digital release today is not "new" for this alert (one alert
 * per title per person, keyed without the kind).
 *
 * No entry for the region means no alert: the primary date alone does not say
 * the film is out where the person lives.
 *
 * @param {any} releaseDates /movie/{id}/release_dates body
 * @param {string} region ISO 3166-1, e.g. 'AU'
 * @param {{ today: string, since: string }} window YYYY-MM-DD, inclusive
 * @returns {{ kind: 'theatrical' | 'digital', date: string } | null}
 */
export function regionalMovieRelease(releaseDates, region, { today, since }) {
  const entry = (releaseDates?.results ?? []).find((/** @type {any} */ r) => r?.iso_3166_1 === region);
  /** @type {{ kind: 'theatrical' | 'digital', date: string } | null} */
  let first = null;
  for (const release of entry?.release_dates ?? []) {
    const kind = RELEASE_KINDS[release?.type];
    const date = dateOnly(release?.release_date);
    if (!kind || !date) continue;
    if (!first || date < first.date) first = { kind, date };
  }
  if (!first || first.date < since || first.date > today) return null;
  return first;
}

/** @param {'movie' | 'tv'} mediaType @param {number} tmdbId */
export const personReleaseKey = (mediaType, tmdbId) => `person_release:${mediaType}:${tmdbId}`;

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
