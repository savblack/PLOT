import { parseCSV } from './importParsing.js';
import { IMPORT_VIEW } from './copy/importView.js';

const HEADERS = {
  'diary.csv': 'Date,Name,Year,Letterboxd URI,Rating,Rewatch,Tags,Watched Date',
  'watched.csv': 'Date,Name,Year,Letterboxd URI',
  'ratings.csv': 'Date,Name,Year,Letterboxd URI,Rating',
  'reviews.csv': 'Date,Name,Year,Letterboxd URI,Rating,Rewatch,Review,Tags,Watched Date',
};

export function isLetterboxdDocument(fileName) {
  return Object.hasOwn(HEADERS, fileName.replace(/^letterboxd[_-]/i, '').toLowerCase());
}

function invalid() { throw new Error(IMPORT_VIEW.letterboxdUnsupported); }
function day(value) {
  if (!value) return null;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value) || !Number.isFinite(Date.parse(value)) || new Date(value).toISOString().slice(0, 10) !== value) invalid();
  return value;
}

/** Verified saved CSV layouts only. Diary/review URLs identify the same logged
 * entry, while watched/ratings URLs identify a film. Never use Date as watched.
 * @param {string} text
 * @param {string} fileName
 * @returns {{entries: any[], warnings: any[], notImported: any[]}}
 */
export function parseLetterboxdDocument(text, fileName) {
  const name = fileName.replace(/^letterboxd[_-]/i, '').toLowerCase();
  if (!Object.hasOwn(HEADERS, name)) invalid();
  const rows = parseCSV(text.replace(/^\uFEFF/, ''));
  if (!rows.length || rows[0].join(',') !== HEADERS[name]) invalid();
  const headers = rows[0];
  const entries = [];
  for (const cells of rows.slice(1)) {
    if (cells.every(value => !value.trim())) continue;
    if (cells.length !== headers.length) invalid();
    const row = Object.fromEntries(headers.map((key, index) => [key, cells[index]]));
    if (!row.Name.trim() || !/^\d{4}$/.test(row.Year) || !/^https:\/\/(?:boxd\.it|letterboxd\.com)\/[^\s]+$/.test(row['Letterboxd URI'])) invalid();
    const uri = row['Letterboxd URI'];
    const base = { title: row.Name.trim(), year: row.Year, hint: 'movie', externalIds: { letterboxd: uri } };
    const rating = row.Rating ? Number(row.Rating) * 2 : null;
    if (rating != null && (!Number.isInteger(rating) || rating < 1 || rating > 10)) invalid();
    if (row.Rewatch && row.Rewatch !== 'Yes') invalid();
    const logged = day(row.Date);
    const watched = day(row['Watched Date']);
    if (name === 'ratings.csv') {
      if (rating == null) invalid();
      entries.push({ ...base, eventId: `rating:${uri}`, annotationScope: 'movie', annotation: { kind: 'rating', rating, ratedAt: logged } });
      // Letterboxd explicitly marks a rated film watched. This is an unknown-
      // date summary, using the same identity as its watched.csv record.
      entries.push({ ...base, eventId: `watched:${uri}`, date: null, rating, note: null });
    } else if (name === 'reviews.csv') {
      if (!row.Review.trim()) invalid();
      // Exported reviews have no spoiler column. Keep text hidden in previews
      // and retain the unknown source status rather than assuming spoiler-free.
      entries.push({ ...base, eventId: `review:${uri}`, annotationScope: 'movie', annotation: {
        kind: 'review', text: row.Review, spoiler: true, spoilerStatus: 'unknown', isReview: true,
        createdAt: logged, updatedAt: null, watchedOn: watched, rating,
      } });
      if (watched) entries.push({ ...base, eventId: `diary:${uri}`, date: watched, rating, note: row.Review });
    } else {
      entries.push({ ...base, eventId: `${name === 'diary.csv' ? 'diary' : 'watched'}:${uri}`, date: watched, rating, note: null });
    }
  }
  return { entries, warnings: name === 'ratings.csv' && entries.length ? [{ title: 'Letterboxd', reason: 'rated_films_watched' }] : [], notImported: [] };
}
