import { IMPORT_VIEW } from './copy/importView.js';

// Saved TV Time Liberator files only. This adapter never connects an account.
// Publisher schema and filenames: docs/billing/public-export-samples.md.
const invalid = () => { throw new Error(IMPORT_VIEW.tvTimeUnsupported); };
const object = value => value && typeof value === 'object' && !Array.isArray(value);
const positive = value => Number.isSafeInteger(value) && value > 0;

function identity(media) {
  if (!object(media) || typeof media.title !== 'string' || !media.title.trim() || !object(media.id)) invalid();
  const ids = {};
  if (positive(media.id.tvdb)) ids.tvdb = media.id.tvdb;
  if (/^tt\d+$/.test(media.id.imdb || '')) ids.imdb = media.id.imdb;
  if (!ids.tvdb && !ids.imdb) invalid();
  return { title: media.title.trim(), externalIds: ids };
}

function rating(value) {
  if (value == null) return null;
  if (!Number.isFinite(value) || value < 0 || value > 10) invalid();
  return value;
}

function watchDate(value) {
  if (value == null || value === '') return { date: null, datePrecision: 'unknown' };
  // A naive timestamp is not an instant. Retain its calendar day only.
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}(?:[ T]\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})?)?$/.test(value)) invalid();
  const day = value.slice(0, 10);
  const parsedDay = new Date(`${day}T00:00:00Z`);
  if (!Number.isFinite(parsedDay.getTime()) || parsedDay.toISOString().slice(0, 10) !== day) invalid();
  if (value.length > 10) {
    const hour = Number(value.slice(11, 13)), minute = Number(value.slice(14, 16)), second = Number(value.slice(17, 19));
    if (hour > 23 || minute > 59 || second > 59) invalid();
  }
  const instant = /(?:Z|[+-]\d{2}:\d{2})$/.test(value);
  if (instant && !Number.isFinite(Date.parse(value.replace(' ', 'T')))) invalid();
  return { date: instant ? value.replace(' ', 'T') : day, datePrecision: instant ? 'instant' : 'day' };
}

/** Parse a single extracted publisher file, with explicit loss reporting.
 * Counts are never expanded into invented dated watches. The report must be
 * shown before confirmation; do not discard it and import entries alone.
 * @param {string} text
 * @param {string} fileName Original shows.json, movies.json, lists.json or favorites.json.
 */
export function parseTvTimeDocument(text, fileName) {
  let data;
  try { data = JSON.parse(text.replace(/^\uFEFF/, '')); } catch { invalid(); }
  const entries = [];
  const notImported = [];
  const warnings = [];
  const addWatch = (media, base, path) => {
    if (typeof media.is_watched !== 'boolean') invalid();
    const sourceRating = rating(media.rating);
    if (media.rewatch_count != null && (!Number.isSafeInteger(media.rewatch_count) || media.rewatch_count < 0)) invalid();
    if (!media.is_watched) {
      if (sourceRating != null) notImported.push({ path, title: base.title, reason: 'unwatched_rating' });
      return;
    }
    const date = watchDate(media.watched_at);
    if (media.watched_at && date.datePrecision === 'day' && media.watched_at.length > 10) warnings.push({ path, title: base.title, reason: 'timezone_unknown' });
    if (media.rewatch_count > 0) notImported.push({ path, title: base.title, reason: 'aggregate_rewatches', count: media.rewatch_count });
    entries.push({ ...base, ...date, rating: sourceRating,
      // No event identifier is provided by this snapshot format. The enclosing
      // shared pipeline uses file digest + original record index for retries.
      externalIds: { ...base.externalIds, ...(media.rewatch_count != null ? { rewatch_count: media.rewatch_count } : {}) },
    });
  };
  const addMedia = (media, hint, path, destination = null) => {
    const base = { ...identity(media), hint };
    if (destination) {
      entries.push({ ...base, destination, date: null, rating: hint === 'movie' ? rating(media.rating) : null });
      return; // Nested episodes in a list are not evidence of a requested history import.
    }
    if (hint === 'movie') { addWatch(media, base, path); return; }
    if (!Array.isArray(media.seasons)) invalid();
    let watched = false;
    for (const [si, season] of media.seasons.entries()) {
      if (!Number.isSafeInteger(season?.number) || season.number < 0 || !Array.isArray(season.episodes)) invalid();
      for (const [ei, episode] of season.episodes.entries()) {
        if (!Number.isSafeInteger(episode?.number) || episode.number < 1 || !object(episode.id)) invalid();
        const episodeIds = {};
        if (positive(episode.id.tvdb)) episodeIds.tvdb = episode.id.tvdb;
        if (/^tt\d+$/.test(episode.id.imdb || '')) episodeIds.imdb = episode.id.imdb;
        if (!episodeIds.tvdb && !episodeIds.imdb) invalid();
        addWatch(episode, { ...base, seasonNumber: season.number, episodeNumber: episode.number,
          externalIds: { ...base.externalIds, episode: episodeIds } }, `${path}.seasons[${si}].episodes[${ei}]`);
        watched ||= episode.is_watched;
      }
    }
    if (!watched) warnings.push({ path, title: base.title, reason: 'followed_show_without_watches' });
  };
  if (['shows.json', 'movies.json'].includes(fileName)) {
    if (!Array.isArray(data)) invalid();
    data.forEach((media, index) => addMedia(media, fileName === 'shows.json' ? 'tv' : 'movie', `${fileName}[${index}]`));
  } else if (['lists.json', 'favorites.json'].includes(fileName)) {
    const lists = fileName === 'favorites.json' ? [data] : data;
    if (!Array.isArray(lists)) invalid();
    lists.forEach((list, index) => {
      if (!object(list) || typeof list.name !== 'string' || !list.name.trim() || !Array.isArray(list.shows) || !Array.isArray(list.movies)) invalid();
      const destination = { kind: 'custom', key: `tvtime:${fileName}:${index}:${list.name.trim()}`, name: list.name.trim(), description: typeof list.description === 'string' ? list.description : null };
      list.shows.forEach((media, i) => addMedia(media, 'tv', `${fileName}[${index}].shows[${i}]`, destination));
      list.movies.forEach((media, i) => addMedia(media, 'movie', `${fileName}[${index}].movies[${i}]`, destination));
      if (!list.shows.length && !list.movies.length) notImported.push({ path: `${fileName}[${index}]`, title: list.name.trim(), reason: 'empty_list' });
    });
  } else invalid();
  return { entries, notImported, warnings };
}
