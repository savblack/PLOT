// A TMDB account, read once by the tmdb-account edge function and uploaded as
// the import file (source 'tmdb'). TMDB has no watch history, so this carries
// the watchlist, the person's own lists and their ratings only.
//
// Every title carries the TMDB ID that TMDB's own account response gave, as
// `tmdbRef`. The resolver looks each one up again before saving
// (importPipeline.resolveImportEntries), because the file passes through the
// person's device and its titles and posters are not trusted.
import { IMPORT_VIEW } from './copy/importView.js';

export const TMDB_ACCOUNT_FORMAT = 'plot-tmdb-account';
export const TMDB_ACCOUNT_FILE = 'tmdb-account.json';

const validId = (id) => Number.isSafeInteger(id) && id > 0;
const validRating = (r) => typeof r === 'number' && Number.isFinite(r) && r > 0 && r <= 10;
const validMediaType = (t) => t === 'movie' || t === 'tv';

/**
 * TMDB rates out of 10 in half points; Plot stores whole points (one point is
 * half a star, packages/core/ratings.js). Plot's own rating is the nearest
 * whole point. The exact TMDB score is kept with the source record: a rated
 * movie's watch event keeps `rating` as is (watch_events.source_rating is
 * numeric), and a show or episode rating keeps it as `sourceRating`.
 * @param {number} rating
 */
export function tmdbRatingToPlot(rating) {
  return Math.min(10, Math.max(1, Math.round(rating)));
}

/** @param {any} item */
function validTitle(item) {
  return item && validId(item.id) && validMediaType(item.media_type)
    && typeof item.title === 'string' && (item.year == null || /^\d{4}$/.test(item.year));
}

/** @param {any} item */
function titleFields(item) {
  return {
    title: item.title.trim() || IMPORT_VIEW.tmdbUntitled,
    year: item.year ?? null,
    hint: item.media_type,
    date: null,
    tmdbRef: { id: item.id, mediaType: item.media_type },
    externalIds: { tmdb: item.id },
  };
}

/**
 * Parse the tmdb-account response. Throws on anything that is not that shape,
 * so a different file uploaded as TMDB is refused rather than half-read.
 * @param {string} text
 * @returns {{ entries: any[], warnings: { title: string, reason: string, count?: number }[], notImported: { title: string, reason: string, count?: number }[] }}
 */
export function parseTmdbAccount(text) {
  let doc;
  try { doc = JSON.parse(String(text).replace(/^\uFEFF/, '')); }
  catch { throw new Error(IMPORT_VIEW.tmdbUnsupported); }
  if (!doc || doc.format !== TMDB_ACCOUNT_FORMAT || doc.version !== 1 || !validId(doc.account?.id)
      || !Array.isArray(doc.watchlist) || !Array.isArray(doc.rated) || !Array.isArray(doc.ratedEpisodes)
      || !Array.isArray(doc.lists)) throw new Error(IMPORT_VIEW.tmdbUnsupported);
  const account = doc.account.id;
  const entries = [];
  let rounded = 0;
  let ratedMovies = 0;

  for (const item of doc.watchlist) {
    if (!validTitle(item)) throw new Error(IMPORT_VIEW.tmdbUnsupported);
    entries.push({
      ...titleFields(item),
      eventId: `${account}:watchlist:${item.media_type}:${item.id}`,
      destination: { kind: 'watchlist', key: 'tmdb:watchlist', name: IMPORT_VIEW.watchlistName },
    });
  }

  for (const list of doc.lists) {
    if (!list || typeof list.id !== 'string' || !/^[\w-]{1,64}$/.test(list.id) || typeof list.name !== 'string'
        || !list.name.trim() || !Array.isArray(list.items)) throw new Error(IMPORT_VIEW.tmdbUnsupported);
    for (const item of list.items) {
      if (!validTitle(item)) throw new Error(IMPORT_VIEW.tmdbUnsupported);
      entries.push({
        ...titleFields(item),
        eventId: `${account}:list:${list.id}:${item.media_type}:${item.id}`,
        destination: { kind: 'custom', key: `tmdb:list:${list.id}`, name: list.name.trim().slice(0, 200) },
      });
    }
  }

  for (const item of doc.rated) {
    if (!validTitle(item) || !validRating(item.rating)) throw new Error(IMPORT_VIEW.tmdbUnsupported);
    if (!Number.isInteger(item.rating)) rounded++;
    if (item.media_type === 'movie') {
      // A rated movie is a watched movie with an unknown date, as with IMDb.
      // `rating` stays exact: buildImportRows rounds it for history and the
      // watch event keeps the TMDB score.
      ratedMovies++;
      entries.push({ ...titleFields(item), rating: item.rating, eventId: `${account}:rating:movie:${item.id}` });
    } else {
      entries.push({
        ...titleFields(item),
        annotationScope: 'show',
        annotation: { kind: 'rating', rating: tmdbRatingToPlot(item.rating), ratedAt: null, sourceRating: item.rating },
        eventId: `${account}:rating:tv:${item.id}`,
      });
    }
  }

  for (const item of doc.ratedEpisodes) {
    if (!item || !validId(item.show_id) || !Number.isInteger(item.season_number) || item.season_number < 0
        || !Number.isInteger(item.episode_number) || item.episode_number < 1 || !validRating(item.rating)
        || typeof item.name !== 'string') throw new Error(IMPORT_VIEW.tmdbUnsupported);
    if (!Number.isInteger(item.rating)) rounded++;
    entries.push({
      title: item.name.trim() || IMPORT_VIEW.tmdbUntitled,
      year: null,
      hint: 'tv',
      date: null,
      tmdbRef: { id: item.show_id, mediaType: 'tv' },
      externalIds: { tmdb: item.show_id },
      seasonNumber: item.season_number,
      episodeNumber: item.episode_number,
      annotationScope: 'episode',
      annotation: { kind: 'rating', rating: tmdbRatingToPlot(item.rating), ratedAt: null, sourceRating: item.rating },
      eventId: `${account}:rating:episode:${item.show_id}:${item.season_number}:${item.episode_number}`,
    });
  }

  const warnings = [];
  if (ratedMovies) warnings.push({ title: 'TMDB', reason: 'tmdb_rated_movies_watched', count: ratedMovies });
  if (rounded) warnings.push({ title: 'TMDB', reason: 'tmdb_ratings_rounded', count: rounded });
  const notImported = [];
  const truncated = Array.isArray(doc.truncated) ? doc.truncated.length : 0;
  if (truncated) notImported.push({ title: 'TMDB', reason: 'tmdb_truncated', count: truncated });
  return { entries, warnings, notImported };
}
