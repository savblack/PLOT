import { excludeKidsContent, prioritiseEnglishSpeakingTitles } from './tmdb.js';

/**
 * Titles to offer on the release calendar so adding one fills it.
 *
 * Two live lists, both excluding anything the viewer already has on their
 * watchlist or is watching:
 *   - TV that has already aired, with another episode still scheduled soon.
 *     A premiere that has not started, or a return dated far out, stays out.
 *   - Movies with a release date coming up in the next few months.
 *
 * Fetchers are injected. The web sheet passes the shared TMDB client. Tests
 * pass fakes. Mobile can call the same function when it grows this sheet.
 */

/** Passed to watchlist.addToList so the title panel does not cover the sheet. */
export const CALENDAR_SUGGESTIONS_SOURCE = 'calendar_suggestions';

const SHOW_LIMIT = 6;
const MOVIE_LIMIT = 6;
const DETAIL_CAP = 12;
const AIRING_HORIZON_DAYS = 120;
const MOVIE_HORIZON_DAYS = 90;
// News, talk, reality, soap, kids, family. Same junk the provider rails drop,
// plus family, so the sheet is series a person would track episode by episode.
const TV_JUNK_GENRES = '10763,10767,10764,10766,10762,10751';

/**
 * @param {URLSearchParams | string | null | undefined} search
 * @returns {boolean}
 */
export function calendarSuggestRequested(search) {
  const params = search instanceof URLSearchParams
    ? search
    : new URLSearchParams(String(search || '').replace(/^\?/, ''));
  return params.get('suggest') === 'upcoming' || params.get('utm_content') === 'release_calendar';
}

/**
 * @param {Array<{ tmdb_id?: number, id?: number }>} [watchlist]
 * @param {Array<{ tmdb_id?: number, id?: number }>} [watching]
 * @returns {Set<number>}
 */
export function trackedTitleIds(watchlist = [], watching = []) {
  const ids = new Set();
  for (const item of [...watchlist, ...watching]) {
    const id = Number(item?.tmdb_id ?? item?.id);
    if (Number.isFinite(id)) ids.add(id);
  }
  return ids;
}

/**
 * @param {number | string | null | undefined} season
 * @param {number | string | null | undefined} episode
 * @returns {string}
 */
export function formatNextEpisodeCode(season, episode) {
  // Number(null) is 0, which would print a fake S00 code for a missing season.
  if (season == null || episode == null || season === '' || episode === '') return '';
  const s = Number(season);
  const e = Number(episode);
  if (!Number.isInteger(s) || !Number.isInteger(e) || s < 0 || e < 1) return '';
  return `S${String(s).padStart(2, '0')}E${String(e).padStart(2, '0')}`;
}

/**
 * Add whole days to a YYYY-MM-DD calendar date. Local date parts, so a
 * timezone never shifts the day.
 * @param {string} ymd
 * @param {number} days
 * @returns {string}
 */
export function addCalendarDays(ymd, days) {
  const [y, m, d] = String(ymd).slice(0, 10).split('-').map(Number);
  const date = new Date(y, (m || 1) - 1, d || 1);
  date.setDate(date.getDate() + days);
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${date.getFullYear()}-${month}-${day}`;
}

function day(value) {
  return typeof value === 'string' ? value.slice(0, 10) : '';
}

/**
 * A series that is already on the air, with a future episode inside the horizon.
 * @param {any} show Discover row
 * @param {any} details /tv/{id} payload, including next_episode_to_air
 * @param {string} todayStr
 * @param {string} horizonEnd
 * @returns {object | null}
 */
export function airingShowSuggestion(show, details, todayStr, horizonEnd) {
  if (!show?.id || !details) return null;
  const first = day(details.first_air_date || show.first_air_date);
  if (!first || first > todayStr) return null;
  if (details.status && details.status !== 'Returning Series') return null;
  const last = day(details.last_episode_to_air?.air_date);
  if (!last || last > todayStr) return null;
  const next = details.next_episode_to_air;
  const nextDate = day(next?.air_date);
  if (!nextDate || nextDate < todayStr || nextDate > horizonEnd) return null;
  const title = show.name || show.title || details.name || '';
  const poster = show.poster_path || details.poster_path || null;
  if (!title || !poster) return null;
  return {
    id: Number(show.id),
    media_type: 'tv',
    title,
    name: title,
    poster_path: poster,
    genre_ids: Array.isArray(show.genre_ids) ? show.genre_ids : [],
    original_language: show.original_language,
    origin_country: show.origin_country,
    next_air_date: nextDate,
    next_code: formatNextEpisodeCode(next.season_number, next.episode_number),
    // Saved with the watchlist row so the title is not dateless. The calendar
    // itself uses the next episode from TV details, not this date.
    first_air_date: first,
  };
}

/**
 * A movie whose release date is still ahead, and not past the horizon.
 * @param {any} movie
 * @param {string} todayStr
 * @param {string} horizonEnd
 * @returns {object | null}
 */
export function movieSuggestion(movie, todayStr, horizonEnd) {
  if (!movie?.id || !movie.poster_path) return null;
  const release = day(movie.release_date);
  if (!release || release < todayStr || release > horizonEnd) return null;
  const title = movie.title || movie.name || '';
  if (!title) return null;
  return {
    id: Number(movie.id),
    media_type: 'movie',
    title,
    poster_path: movie.poster_path,
    genre_ids: Array.isArray(movie.genre_ids) ? movie.genre_ids : [],
    original_language: movie.original_language,
    release_date: release,
    _cinema: movie._cinema !== false,
  };
}

function pick(items, limit) {
  return excludeKidsContent(prioritiseEnglishSpeakingTitles(items), true).slice(0, limit);
}

/**
 * @param {object} args
 * @param {(params: object) => Promise<any>} args.discoverTV
 * @param {(params: object) => Promise<any>} args.discoverMovies
 * @param {(id: number) => Promise<any>} args.getTVDetails
 * @param {Set<number>} [args.trackedIds]
 * @param {string} args.todayStr
 * @param {string} [args.region]
 * @returns {Promise<{ shows: object[], movies: object[], showsUnavailable: boolean, moviesUnavailable: boolean }>}
 */
export async function loadUpcomingSuggestions({
  discoverTV,
  discoverMovies,
  getTVDetails,
  trackedIds = new Set(),
  todayStr,
  region = 'US',
}) {
  const showEnd = addCalendarDays(todayStr, AIRING_HORIZON_DAYS);
  const movieEnd = addCalendarDays(todayStr, MOVIE_HORIZON_DAYS);
  const primaryFloor = addCalendarDays(todayStr, -365);
  const tvQuery = {
    'air_date.gte': todayStr,
    'air_date.lte': showEnd,
    'first_air_date.lte': todayStr,
    with_status: '0',
    sort_by: 'popularity.desc',
    'vote_count.gte': '40',
    without_genres: TV_JUNK_GENRES,
    include_adult: 'false',
    page: '1',
  };
  const movieBase = {
    'release_date.gte': todayStr,
    'release_date.lte': movieEnd,
    'primary_release_date.gte': primaryFloor,
    sort_by: 'popularity.desc',
    region,
    include_adult: 'false',
    'vote_count.gte': '20',
    page: '1',
  };

  const [tvPage, theatricalPage, streamingPage] = await Promise.all([
    Promise.resolve(discoverTV(tvQuery)).catch(() => null),
    Promise.resolve(discoverMovies({ ...movieBase, with_release_type: '2|3' })).catch(() => null),
    Promise.resolve(discoverMovies({ ...movieBase, with_release_type: '4' })).catch(() => null),
  ]);

  const showsUnavailable = tvPage == null;
  const moviesUnavailable = theatricalPage == null && streamingPage == null;

  const candidates = (tvPage?.results || [])
    .filter(show => show?.poster_path && !trackedIds.has(Number(show.id)))
    .slice(0, DETAIL_CAP);
  const detailed = await Promise.all(candidates.map(async (show) => {
    try {
      return [show, await getTVDetails(show.id)];
    } catch {
      return [show, null];
    }
  }));
  const shows = [];
  const seenShows = new Set();
  for (const [show, details] of detailed) {
    const suggestion = airingShowSuggestion(show, details, todayStr, showEnd);
    if (!suggestion || trackedIds.has(suggestion.id) || seenShows.has(suggestion.id)) continue;
    seenShows.add(suggestion.id);
    shows.push(suggestion);
  }

  const theatrical = (theatricalPage?.results || []).map(movie => ({ ...movie, _cinema: true }));
  const theatricalIds = new Set(theatrical.map(movie => movie.id));
  const streaming = (streamingPage?.results || [])
    .filter(movie => !theatricalIds.has(movie.id))
    .map(movie => ({ ...movie, _cinema: false }));
  const movies = [];
  const seenMovies = new Set();
  for (const movie of [...theatrical, ...streaming]) {
    const suggestion = movieSuggestion(movie, todayStr, movieEnd);
    if (!suggestion || trackedIds.has(suggestion.id) || seenMovies.has(suggestion.id)) continue;
    seenMovies.add(suggestion.id);
    movies.push(suggestion);
  }

  return {
    shows: pick(shows, SHOW_LIMIT).sort((a, b) => a.next_air_date.localeCompare(b.next_air_date)),
    movies: pick(movies, MOVIE_LIMIT).sort((a, b) => a.release_date.localeCompare(b.release_date)),
    showsUnavailable,
    moviesUnavailable,
  };
}
