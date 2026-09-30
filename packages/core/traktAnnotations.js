import { IMPORT_VIEW } from './copy/importView.js';

// Only filenames backed by non-empty public export samples are enabled.
export const TRAKT_ANNOTATION_FILES = {
  'ratings-shows.json': { kind: 'rating', scope: 'show' },
  'ratings-episodes.json': { kind: 'rating', scope: 'episode' },
  'comments-seasons.json': { kind: 'review', scope: 'season' },
};

function invalid() { throw new Error(IMPORT_VIEW.traktAnnotationUnsupported); }
function instant(value) {
  if (value == null) return null;
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?Z$/.test(value) ||
      !Number.isFinite(Date.parse(value)) || new Date(value).toISOString().slice(0, 10) !== value.slice(0, 10)) invalid();
  return value;
}

/** Parse annotations independently from watches. These records require an
 * annotation writer; neither watch dates nor watched state are inferred.
 * @param {string} text
 * @param {'rating'|'review'} kind
 */
export function parseTraktAnnotations(text, kind) {
  if (!['rating', 'review'].includes(kind)) invalid();
  let records;
  try { records = JSON.parse(text.replace(/^\uFEFF/, '')); } catch { invalid(); }
  if (!Array.isArray(records)) invalid();
  return records.map(record => {
    if (!record || !['movie', 'show', 'season', 'episode'].includes(record.type)) invalid();
    const media = record.type === 'movie' ? record.movie : record.show;
    if (!media || typeof media.title !== 'string' || !media.title.trim() ||
        !Number.isInteger(media.year) || media.year < 1800 || media.year > 9999 || !/^tt\d+$/.test(media.ids?.imdb || '')) invalid();
    /** @type {{title: string, year: number, hint: 'movie'|'tv', externalIds: {imdb: string}, annotationScope: string, seasonNumber?: number, episodeNumber?: number}} */
    const base = { title: media.title.trim(), year: media.year, hint: record.type === 'movie' ? 'movie' : 'tv',
      externalIds: { imdb: media.ids.imdb }, annotationScope: record.type };
    if (['season', 'episode'].includes(record.type)) {
      const season = record.type === 'episode' ? record.episode?.season : record.season?.number;
      if (!Number.isSafeInteger(season) || season < 0) invalid();
      base.seasonNumber = season;
    }
    if (record.type === 'episode') {
      if (!Number.isSafeInteger(record.episode?.number) || record.episode.number < 1) invalid();
      base.episodeNumber = record.episode.number;
    }
    if (kind === 'rating') {
      if (!Number.isInteger(record.rating) || record.rating < 1 || record.rating > 10 || !Object.hasOwn(record, 'rated_at')) invalid();
      return { ...base, annotation: { kind, rating: record.rating, ratedAt: instant(record.rated_at) } };
    }
    const comment = record.comment;
    if (!comment || !Number.isSafeInteger(comment.id) || comment.id <= 0 || typeof comment.comment !== 'string' ||
        !comment.comment.trim() || typeof comment.spoiler !== 'boolean' || typeof comment.review !== 'boolean') invalid();
    return { ...base, eventId: `comment:${comment.id}`, annotation: { kind, text: comment.comment,
      spoiler: comment.spoiler, isReview: comment.review,
      createdAt: instant(comment.created_at), updatedAt: instant(comment.updated_at) } };
  });
}
