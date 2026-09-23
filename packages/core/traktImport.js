import { IMPORT_VIEW } from './copy/importView.js';

/** Parse individual saved Trakt history events, never aggregate play counts.
 * External IDs remain provenance; the shared resolver obtains TMDB matches.
 * @param {string} text
 */
export function parseTraktHistory(text) {
  let records;
  try { records = JSON.parse(text.replace(/^\uFEFF/, '')); }
  catch { throw new Error(IMPORT_VIEW.traktUnsupported); }
  if (!Array.isArray(records)) throw new Error(IMPORT_VIEW.traktUnsupported);
  return records.map(record => {
    if (!record || !['movie', 'episode'].includes(record.type) ||
        !['watch', 'scrobble', 'checkin'].includes(record.action) ||
        !Number.isSafeInteger(record.id) || record.id <= 0 ||
        !Object.hasOwn(record, 'watched_at')) throw new Error(IMPORT_VIEW.traktUnsupported);
    const isEpisode = record.type === 'episode';
    const media = isEpisode ? record.show : record.movie;
    if (!media || typeof media.title !== 'string' || !media.title.trim() ||
        !Number.isInteger(media.year) || media.year < 1800 || media.year > 9999 ||
        !/^tt\d+$/.test(media.ids?.imdb || '')) throw new Error(IMPORT_VIEW.traktUnsupported);
    const date = record.watched_at;
    if (date !== null && (typeof date !== 'string' ||
        !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?Z$/.test(date) ||
        !Number.isFinite(Date.parse(date)) ||
        new Date(date).toISOString().slice(0, 10) !== date.slice(0, 10))) {
      throw new Error(IMPORT_VIEW.traktUnsupported);
    }
    if (isEpisode && (!Number.isInteger(record.episode?.season) || record.episode.season < 0 ||
        !Number.isInteger(record.episode?.number) || record.episode.number < 1)) {
      throw new Error(IMPORT_VIEW.traktUnsupported);
    }
    return {
      title: media.title.trim(), year: media.year, hint: isEpisode ? 'tv' : 'movie',
      date, datePrecision: date ? 'instant' : 'unknown', eventId: record.id,
      externalIds: { ...media.ids, ...(isEpisode ? { episode: record.episode.ids || {} } : {}) },
      ...(isEpisode ? { seasonNumber: record.episode.season, episodeNumber: record.episode.number } : {}),
    };
  });
}

/** Saved lists-watchlist.json membership is never evidence of a watch.
 * Native export fixture provenance: docs/billing/public-export-samples.md.
 * @param {string} text
 */
export function parseTraktWatchlist(text) {
  let records;
  try { records = JSON.parse(text.replace(/^\uFEFF/, '')); }
  catch { throw new Error(IMPORT_VIEW.traktWatchlistUnsupported); }
  if (!Array.isArray(records)) throw new Error(IMPORT_VIEW.traktWatchlistUnsupported);
  return records.map(record => {
    const media = record?.type === 'show' ? record.show : record?.movie;
    if (!record || !['movie', 'show'].includes(record.type) ||
        !Number.isSafeInteger(record.id) || record.id <= 0 || !media ||
        typeof media.title !== 'string' || !media.title.trim() ||
        !Number.isInteger(media.year) || media.year < 1800 || media.year > 9999 ||
        !/^tt\d+$/.test(media.ids?.imdb || '') ||
        (record.notes != null && typeof record.notes !== 'string')) throw new Error(IMPORT_VIEW.traktWatchlistUnsupported);
    return {
      title: media.title.trim(), year: media.year, hint: record.type === 'show' ? 'tv' : 'movie',
      date: null, listNote: record.notes || null,
      sourceMetadata: { trakt_rating: record.my_rating ?? null, listed_at: record.listed_at ?? null },
      eventId: `watchlist:${record.id}`,
      externalIds: { imdb: media.ids.imdb, ...(media.ids.tvdb ? { tvdb: media.ids.tvdb } : {}) },
      destination: { kind: 'watchlist', key: 'trakt:watchlist', name: IMPORT_VIEW.watchlistName },
    };
  });
}
