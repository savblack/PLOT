import { IMPORT_VIEW } from './copy/importView.js';
import { parseTraktHistory, parseTraktWatchlist } from './traktImport.js';
// Shared, pure helpers for parsing watch-history exports.
// Kept framework-free so they can be unit-tested directly (ImportView is .jsx).

/**
 * A single parsed row from a platform export, before TMDB resolution.
 *
 * @typedef {object} ParsedImportEntry
 * @property {{ kind: string, key: string, name: string, description?: string|null }} [destination] List membership destination, never a watch.
 * @property {string} title Raw title text as it appeared in the export.
 * @property {'movie' | 'tv' | 'unknown'} hint Best-guess media type. TMDB
 *   search is the source of truth; this only biases the lookup.
 * @property {number} [seasonNumber] Explicit season ordinal from the source.
 * @property {string} [episodeTitle] Source episode name, requiring a unique catalogue match.
 * @property {boolean} [requiresWatchReview] Playback activity must be explicitly selected as a watch.
 * @property {'instant'|'day'|'unknown'} [datePrecision] Precision provided by the source.
 * @property {string | null} [date] ISO date/instant, or null when the export had
 *   no usable date column. Use `watchedAtFor` rather than reading this
 *   directly when building a history row; unknown dates stay null.
 */

/** @typedef {'netflix' | 'prime' | 'disney' | 'max' | 'apple' | 'letterboxd' | 'imdb' | 'trakt'} ImportPlatform */

export function parseCSV(text) {
  const lines = text.replace(/\r\n/g, '\n').replace(/\r/g, '\n');

  // Parse into array-of-arrays handling quoted fields and escaped ""
  const rawRows = [];
  let row = [];
  let field = '';
  let inQuotes = false;

  for (let ci = 0; ci < lines.length; ci++) {
    const ch = lines[ci];
    if (inQuotes) {
      if (ch === '"') {
        if (lines[ci + 1] === '"') { field += '"'; ci++; }
        else inQuotes = false;
      } else {
        field += ch;
      }
    } else {
      if (ch === '"') { inQuotes = true; }
      else if (ch === ',') { row.push(field); field = ''; }
      else if (ch === '\n') { row.push(field); rawRows.push(row); row = []; field = ''; }
      else { field += ch; }
    }
  }
  if (inQuotes) throw new Error(IMPORT_VIEW.csvUnclosedQuote);
  if (field || row.length) { row.push(field); rawRows.push(row); }

  return rawRows;
}

export function fuzzyCol(header) {
  return header.toLowerCase().replace(/[^a-z0-9]/g, '');
}

export function findCol(headers, ...candidates) {
  const fuzzed = headers.map(fuzzyCol);
  for (const c of candidates) {
    const idx = fuzzed.findIndex(h => h.includes(fuzzyCol(c)));
    if (idx !== -1) return idx;
  }
  return -1;
}

// Source fields must match a whole normalised header. Substring matching can
// mistake Release Date for Date or Profile Name for Name.
function findExactCol(headers, ...candidates) {
  const normalised = headers.map(fuzzyCol);
  for (const candidate of candidates) {
    const index = normalised.indexOf(fuzzyCol(candidate));
    if (index !== -1) return index;
  }
  return -1;
}

// Reject rollover (for example February 30) instead of inventing a watch day.
function validCalendarDate(value) {
  const parsed = new Date(`${value}T00:00:00Z`);
  return Number.isFinite(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value ? value : null;
}

// Slash dates (DD/MM/YYYY vs MM/DD/YYYY) are ambiguous whenever both segments
// are <= 12 — e.g. a UK export's "03/04/2024" (3 April) reads as US "March 4"
// unless we know the file's convention. `dayFirst` lets a caller pass that
// convention in (see detectDayFirst below); rows that are unambiguous on
// their own (a segment > 12) are always resolved correctly regardless.
export function normaliseDate(raw, { dayFirst = false, shortYearCentury = null } = {}) {
  if (typeof raw !== 'string' || !raw.trim()) return null;
  const s = raw.trim();

  // ISO: YYYY-MM-DD or YYYY-MM-DDTHH...
  if (/^\d{4}-\d{2}-\d{2}(?:$|T|\s)/.test(s)) return validCalendarDate(s.slice(0, 10));

  // DD/MM/YYYY or MM/DD/YYYY
  const slashMatch = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4}|\d{2})(?:$|\s)/);
  if (slashMatch) {
    const [, a, b, rawYear] = slashMatch;
    // Only formats with an established century may expand a shortened year.
    if (rawYear.length === 2 && shortYearCentury === null) return null;
    const y = rawYear.length === 2 ? String(shortYearCentury + Number(rawYear)) : rawYear;
    // If first segment > 12 it must be a day, regardless of file convention
    if (parseInt(a) > 12) return validCalendarDate(`${y}-${b.padStart(2,'0')}-${a.padStart(2,'0')}`);
    if (parseInt(b) > 12) return validCalendarDate(`${y}-${a.padStart(2,'0')}-${b.padStart(2,'0')}`);
    // Ambiguous (both segments <= 12) — use the file-level convention,
    // defaulting to MM/DD/YYYY (Netflix default) when none was detected.
    if (dayFirst) return validCalendarDate(`${y}-${b.padStart(2,'0')}-${a.padStart(2,'0')}`);
    return validCalendarDate(`${y}-${a.padStart(2,'0')}-${b.padStart(2,'0')}`);
  }

  // Try native parse as last resort
  const d = new Date(s);
  if (!isNaN(d)) return d.toISOString().slice(0, 10);
  return null;
}

// Scan a column of raw date strings for an unambiguous DD/MM/YYYY row (first
// segment > 12) to infer the whole file's convention before parsing any row.
export function detectDayFirst(rawDates) {
  for (const raw of rawDates) {
    if (!raw) continue;
    const match = raw.trim().match(/^(\d{1,2})\/(\d{1,2})\/(\d{4}|\d{2})(?:$|\s)/);
    if (match && parseInt(match[1], 10) > 12) return true;
  }
  return false;
}

// Letterboxd exports a ZIP of CSVs; the richest single file is diary.csv
// (Date, Name, Year, Letterboxd URI, Rating, Rewatch, Tags, Watched Date), but
// watched.csv / ratings.csv / reviews.csv share the same Name/Year/Rating columns.
// Ratings are 0.5–5 stars → doubled to PLOT's 1–10 scale. Letterboxd is film-only.
export function parseLetterboxd(text) {
  const rows = parseCSV(text);
  if (rows.length < 2) return [];
  const headers = rows[0];
  const titleIdx  = findCol(headers, 'name', 'title', 'film');
  const yearIdx   = findCol(headers, 'year');
  const dateIdx   = headers.findIndex(h => fuzzyCol(h) === 'watcheddate'); // logged date is not a watch date
  const ratingIdx = findCol(headers, 'rating');
  const reviewIdx = findCol(headers, 'review');
  if (titleIdx === -1) return [];
  const dayFirst = dateIdx !== -1 && detectDayFirst(rows.slice(1).map(r => r[dateIdx]));

  return rows.slice(1).map(r => {
    const title = r[titleIdx]?.trim();
    if (!title) return null;
    const yearRaw   = yearIdx   !== -1 ? (r[yearIdx]   || '').trim() : '';
    const ratingRaw = ratingIdx !== -1 ? (r[ratingIdx] || '').trim() : '';
    const reviewRaw = reviewIdx !== -1 ? (r[reviewIdx] || '').trim() : '';
    const stars = ratingRaw ? parseFloat(ratingRaw) : NaN;
    return {
      title,
      hint: 'movie',
      date: dateIdx !== -1 ? normaliseDate(r[dateIdx], { dayFirst }) : null,
      year: /^\d{4}$/.test(yearRaw) ? yearRaw : null,
      rating: Number.isFinite(stars) && stars > 0 ? Math.round(stars * 2) : null,
      note: reviewRaw || null,
    };
  }).filter(Boolean);
}

// IMDb's ratings export is a CSV headed by fields such as Const, Your Rating,
// Date Rated, Title, Title Type and Year. Ratings already use Plot's 1–10
// scale. Episode and game rows are omitted because Plot history represents a
// movie or a whole series, and guessing a parent series from an episode title
// can silently import the wrong work.
export function parseImdb(text) {
  const rows = parseCSV(text);
  if (rows.length < 2) return [];
  const headers = rows[0].map(fuzzyCol);
  const exact = (...names) => {
    for (const name of names) {
      const index = headers.indexOf(fuzzyCol(name));
      if (index !== -1) return index;
    }
    return -1;
  };
  const idIdx = exact('const', 'imdb id');
  const titleIdx = exact('title');
  const typeIdx = exact('title type', 'type');
  const yearIdx = exact('year');
  const dateIdx = exact('date rated', 'rated date');
  const ratingIdx = exact('your rating', 'my rating');
  if (titleIdx === -1) return [];

  return rows.slice(1).map(row => {
    const title = row[titleIdx]?.trim();
    if (!title) return null;
    const type = typeIdx === -1 ? '' : (row[typeIdx] || '').trim().toLowerCase();
    if (type.includes('episode') || type.includes('game') || type.includes('podcast')) return null;

    const hint = type.includes('series') || type.includes('mini series') || type.includes('tv special')
      ? 'tv'
      : type.includes('movie') || type.includes('short') || type === 'video'
        ? 'movie'
        : 'unknown';
    const yearRaw = yearIdx === -1 ? '' : (row[yearIdx] || '').trim();
    const rating = ratingIdx === -1 ? NaN : Number(row[ratingIdx]);
    const externalId = idIdx === -1 ? '' : (row[idIdx] || '').trim();

    return {
      title,
      hint,
      date: dateIdx === -1 ? null : normaliseDate(row[dateIdx]),
      year: /^\d{4}$/.test(yearRaw) ? yearRaw : null,
      rating: Number.isFinite(rating) && rating >= 1 && rating <= 10 ? Math.round(rating) : null,
      externalId: /^tt\d+$/.test(externalId) ? externalId : null,
    };
  }).filter(Boolean);
}

/* ─────────────────── Streaming platform parsers ───────────────────
   Each returns an array of { title, hint, date } (Letterboxd adds year/
   rating/note). `hint` is 'tv' | 'movie' | 'unknown' — a guess the caller
   refines against TMDB. Previously inline in the web ImportView; lifted here
   so mobile can share them too. */

const TV_SEGMENT_RE = /^(season|series|part|episode|ep\s?\d|s\d)/i;

function stripNetflixEpisode(title) {
  const parts = title.split(':').map(p => p.trim());
  const marker = parts.findIndex((part, index) => index > 0 && TV_SEGMENT_RE.test(part));
  if (marker > 0) {
    const season = parts[marker].match(/^(?:season|series)\s+(\d+)$/i);
    const episodeTitle = parts.slice(marker + 1).join(': ').trim();
    return { title: parts.slice(0, marker).join(': '), hint: 'tv',
      ...(season && episodeTitle ? { seasonNumber: Number(season[1]), episodeTitle } : {}),
    };
  }
  return { title, hint: 'unknown' };
}

export function parseNetflix(text, { onOmitted = (_index) => {} } = {}) {
  const rows = parseCSV(text);
  if (rows.length < 2) return [];
  const headers = rows[0];
  const titleIdx = findExactCol(headers, 'title', 'name');
  const dateIdx  = findExactCol(headers, 'datewatched', 'watcheddate', 'date', 'watched', 'viewdate');
  if (titleIdx === -1) return [];
  const dayFirst = dateIdx !== -1 && detectDayFirst(rows.slice(1).map(r => r[dateIdx]));

  return rows.slice(1).map((r, index) => {
    const raw = r[titleIdx]?.trim();
    if (!raw) { if (r.some(value => value.trim())) onOmitted(index); return null; }
    const identity = stripNetflixEpisode(raw);
    // Netflix viewing activity is a streaming-era export (2000s), and its
    // saved CSVs include both two- and four-digit years.
    const date = dateIdx !== -1 ? normaliseDate(r[dateIdx], { dayFirst, shortYearCentury: 2000 }) : null;
    return { ...identity, date };
  }).filter(Boolean);
}

export function parsePrime(text, { onOmitted = (_index) => {} } = {}) {
  const rows = parseCSV(text.replace(/^\uFEFF/, ''));
  if (rows.length < 2) return [];
  const headers = rows[0];
  const playbackIdx = headers.indexOf('Playback Start Datetime (UTC)');
  if (playbackIdx !== -1) {
    if (!['Title', 'Playback End Datetime (UTC)', 'Seconds Viewed'].every(header => headers.includes(header))) throw new Error('Unsupported Amazon playback export format.');
    return rows.slice(1).map((row, index) => {
      // This saved native format wraps some titles in another literal quote pair.
      const title = row[headers.indexOf('Title')]?.trim().replace(/^"(.*)"$/, '$1').trim();
      if (!title || title === 'Not available') { if (row.some(value => value.trim())) onOmitted(index); return null; }
      const rawDate = row[playbackIdx]?.trim();
      const instant = /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/.test(rawDate || '') ? rawDate.replace(' ', 'T') + 'Z' : null;
      const date = instant && Number.isFinite(Date.parse(instant)) && new Date(instant).toISOString().replace('.000Z', 'Z') === instant ? instant : null;
      return { title, hint: 'unknown', date, datePrecision: date ? 'instant' : 'unknown', requiresWatchReview: true };
    }).filter(Boolean);
  }
  const titleIdx = findExactCol(headers, 'title', 'name', 'content');
  const dateIdx  = findExactCol(headers, 'watcheddate', 'datewatched', 'date', 'watched', 'viewdate', 'lastwatched');
  if (titleIdx === -1) return [];
  const dayFirst = dateIdx !== -1 && detectDayFirst(rows.slice(1).map(r => r[dateIdx]));

  return rows.slice(1).map((r, index) => {
    const title = r[titleIdx]?.trim();
    if (!title) { if (r.some(value => value.trim())) onOmitted(index); return null; }
    return { title, hint: 'unknown', date: dateIdx !== -1 ? normaliseDate(r[dateIdx], { dayFirst }) : null };
  }).filter(Boolean);
}

function unwrapJson(raw) {
  if (Array.isArray(raw)) return raw;
  if (!raw || typeof raw !== 'object') throw new Error(IMPORT_VIEW.unsupportedJsonLayout);
  const keys = ['data', 'watchHistory', 'PlayHistory', 'items', 'Interactions', 'history']
    .filter(key => Object.hasOwn(raw, key));
  // Never choose one collection and silently lose another, or treat an unknown
  // envelope as an empty history. Empty recognised arrays are still valid.
  if (keys.length !== 1 || !Array.isArray(raw[keys[0]])) throw new Error(IMPORT_VIEW.unsupportedJsonLayout);
  return raw[keys[0]];
}

export function parseDisney(text, { onOmitted = (_index) => {} } = {}) {
  const raw = JSON.parse(text);
  const items = unwrapJson(raw);
  return items.map((item, index) => {
    const title = (item.seriesTitle || item.contentTitle || item.title || '').trim();
    if (!title) { onOmitted(index); return null; }
    const hint = item.seriesTitle ? 'tv' : 'unknown';
    const date = normaliseDate(item.watchedAt || item.date || item.timestamp);
    return { title, hint, date };
  }).filter(Boolean);
}

export function parseMax(text, { onOmitted = (_index) => {} } = {}) {
  // Try JSON first, fall back to CSV
  try {
    const raw = JSON.parse(text);
    const items = unwrapJson(raw);
    return items.map((item, index) => {
      const title = (item.Title || item.title || item.name || '').trim();
      if (!title) { onOmitted(index); return null; }
      const hint = (item['Content Type'] || item.contentType || item.type || '').toLowerCase().includes('series') ? 'tv' : 'unknown';
      const date = normaliseDate(item['Date Watched'] || item.dateWatched || item.date);
      return { title, hint, date };
    }).filter(Boolean);
  } catch (error) {
    // A JSON record error is not evidence that the file is CSV.
    if (!(error instanceof SyntaxError) || /^\s*[[{]/.test(text)) throw error;
    const rows = parseCSV(text);
    if (rows.length < 2) return [];
    const headers = rows[0];
    const titleIdx = findExactCol(headers, 'title', 'name');
    const dateIdx  = findExactCol(headers, 'datewatched', 'watcheddate', 'date', 'watched');
    const typeIdx  = findExactCol(headers, 'contenttype', 'type', 'content');
    if (titleIdx === -1) return [];
    const dayFirst = dateIdx !== -1 && detectDayFirst(rows.slice(1).map(r => r[dateIdx]));
    return rows.slice(1).map((r, index) => {
      const title = r[titleIdx]?.trim();
      if (!title) { if (r.some(value => value.trim())) onOmitted(index); return null; }
      const typeVal = typeIdx !== -1 ? (r[typeIdx] || '').toLowerCase() : '';
      const hint = typeVal.includes('series') || typeVal.includes('tv') ? 'tv' : 'unknown';
      return { title, hint, date: dateIdx !== -1 ? normaliseDate(r[dateIdx], { dayFirst }) : null };
    }).filter(Boolean);
  }
}

export function parseApple(text, { onOmitted = (_index) => {} } = {}) {
  const raw = JSON.parse(text);
  const items = unwrapJson(raw);
  return items.map((item, index) => {
    const seriesTitle = item.Series_Title || item.series_title || '';
    const itemTitle   = item.Item_Description || item.title || '';
    const title = (seriesTitle || itemTitle).trim();
    if (!title) { onOmitted(index); return null; }
    const hint = seriesTitle ? 'tv' : (item.Media_Type || '').toLowerCase().includes('tv') ? 'tv' : 'unknown';
    const date = normaliseDate(item.Event_End_Timestamp || item.date);
    return { title, hint, date };
  }).filter(Boolean);
}

/**
 * Dispatch raw export text to the right parser by platform id.
 *
 * @param {ImportPlatform | string} platformId
 * @param {string} text
 * @returns {ParsedImportEntry[]}
 */
export function parsePlatform(platformId, text, { fileName = '', onOmitted = (_index) => {} } = {}) {
  if (platformId === 'trakt' && fileName === 'lists-watchlist.json') return parseTraktWatchlist(text);
  if (platformId === 'imdb' && /^(imdb[_-])?watchlist\.csv$/i.test(fileName)) return parseImdbWatchlist(text);
  if (platformId === 'letterboxd') {
    const list = parseLetterboxdList(text, fileName);
    if (list) return list;
  }
  switch (platformId) {
    case 'trakt': return parseTraktHistory(text);
    case 'netflix':    return parseNetflix(text, { onOmitted });
    case 'prime':      return parsePrime(text, { onOmitted });
    case 'disney':     return parseDisney(text, { onOmitted });
    case 'max':        return parseMax(text, { onOmitted });
    case 'apple':      return parseApple(text, { onOmitted });
    case 'letterboxd': return parseLetterboxd(text);
    case 'imdb': return parseImdbRatings(text);
    default:           return [];
  }
}

/** Preserve unknown dates. Import time is never evidence of watch time.
 * @param {ParsedImportEntry} entry
 * @returns {string | null}
 */
export function watchedAtFor(entry) {
  return entry.date || null;
}

/** IMDb ratings CSV, verified against captured public export fixtures.
 * Date Rated is not a watch date. Reject other exports/types instead of guessing.
 */
export function parseImdbRatings(text) {
  const [rawHeaders, ...rows] = parseCSV(text.replace(/^\uFEFF/, ''));
  const headers = rawHeaders || [];
  if (headers.includes('Position')) throw new Error('Unsupported IMDb list export. For a movie watchlist, keep the original watchlist.csv filename. Custom-list formats are not supported yet.');
  const required = ['Const', 'Your Rating', 'Date Rated', 'Title', 'Title Type', 'Year'];
  if (required.some(header => !headers.includes(header)) || new Set(headers).size !== headers.length) {
    throw new Error('Unsupported IMDb export. Choose an IMDb movie ratings CSV. Watchlists and other export formats are not supported yet.');
  }
  const column = name => headers.indexOf(name);
  return rows.filter(row => row.some(value => value.trim())).map(row => {
    const title = row[column('Title')]?.trim();
    const imdb = row[column('Const')]?.trim();
    const type = row[column('Title Type')]?.trim().toLowerCase().replace(/\s+/g, '');
    const rating = Number(row[column('Your Rating')]);
    const year = row[column('Year')]?.trim();
    if (!['movie', 'tvseries', 'tvminiseries'].includes(type)) throw new Error('This IMDb file contains unsupported ratings. Supported types are movies, TV series and TV miniseries. Episode ratings require verified episode identities.');
    if (!title || !/^tt\d+$/.test(imdb || '') || !Number.isInteger(rating) || rating < 1 || rating > 10 || !/^\d{4}$/.test(year || '')) {
      throw new Error('An IMDb rating record is incomplete or invalid. No records have been imported.');
    }
    if (type !== 'movie') {
      const ratedAt = row[column('Date Rated')]?.trim() || null;
      if (ratedAt && (!/^\d{4}-\d{2}-\d{2}$/.test(ratedAt) || normaliseDate(ratedAt) !== ratedAt)) throw new Error('An IMDb rating date is invalid. No records have been imported.');
      return { title, hint: 'tv', year, date: null, externalIds: { imdb }, annotationScope: 'show',
        eventId: `rating:${imdb}`, annotation: { kind: 'rating', rating, ratedAt } };
    }
    return { title, hint: 'movie', year, rating, date: null, externalIds: { imdb } };
  });
}

/** Saved Letterboxd list formats verified against pinned export samples. */
export function parseLetterboxdList(text, fileName = '') {
  const rows = parseCSV(text.replace(/^\uFEFF/, ''));
  const first = rows.findIndex(row => row.some(value => value.trim()));
  const header = rows[first] || [];
  let destination;
  let items;
  if (header.join(',') === 'Date,Name,Tags,URL,Description') {
    const metadata = rows[first + 1];
    const start = rows.findIndex(row => row.join(',') === 'Position,Name,Year,URL,Description');
    if (!metadata?.[1]?.trim() || !/^https:\/\/(boxd\.it|letterboxd\.com)\//.test(metadata[3] || '') || start < first + 2) throw new Error('Unsupported Letterboxd custom-list export.');
    destination = { kind: 'custom', key: `letterboxd:list:${metadata[3]}`, name: metadata[1].trim(), description: metadata[4] || null };
    items = rows.slice(start + 1);
  } else if (/^(letterboxd[_-])?watchlist\.csv$/i.test(fileName)) {
    if (header.join(',') !== 'Date,Name,Year,Letterboxd URI') throw new Error('Unsupported Letterboxd watchlist export.');
    destination = { kind: 'watchlist', key: 'letterboxd:watchlist', name: 'Watchlist' };
    items = rows.slice(first + 1);
  } else {
    if (fileName && header.join(',') === 'Date,Name,Year,Letterboxd URI' && !/^(letterboxd[_-])?watched\.csv$/i.test(fileName)) throw new Error('This file could be a watchlist or watched export. Keep the original watched.csv or watchlist.csv filename so PLOT can distinguish them.');
    return null;
  }
  return items.filter(row => row.some(value => value.trim())).map(row => {
    if (!row[1]?.trim() || !/^\d{4}$/.test(row[2] || '') || !/^https:\/\/(boxd\.it|letterboxd\.com)\//.test(row[3] || '')) throw new Error('Incomplete Letterboxd list record. Nothing was imported.');
    return { title: row[1].trim(), year: row[2], hint: 'movie', date: null,
      destination, listNote: destination.kind === 'custom' ? row[4] || null : null,
      eventId: `${destination.key}:${row[3]}` };
  });
}

/** Saved watchlist export, verified independently of IMDb's ratings export. */
export function parseImdbWatchlist(text) {
  const [headers = [], ...rows] = parseCSV(text.replace(/^\uFEFF/,''));
  const required = ['Position','Const','Created','Modified','Description','Title','URL','Title Type','Year','Your Rating','Date Rated'];
  if (required.some(name => !headers.includes(name)) || new Set(headers).size !== headers.length) throw new Error('Unsupported IMDb watchlist format.');
  const value = (row,name) => row[headers.indexOf(name)]?.trim() || '';
  return rows.filter(row => row.some(cell => cell.trim())).map(row => {
    const title=value(row,'Title'), imdb=value(row,'Const'), year=value(row,'Year'), rating=value(row,'Your Rating');
    const type = value(row,'Title Type').toLowerCase().replace(/\s+/g, '');
    const hint = { movie: 'movie', tvmovie: 'movie', tvseries: 'tv', tvminiseries: 'tv' }[type];
    if (!hint) throw new Error('This IMDb watchlist contains an unsupported title type. Supported types are movies, TV movies, TV series and TV miniseries. Episodes cannot be imported as whole series.');
    if (!title || !/^tt\d+$/.test(imdb) || !/^\d{4}$/.test(year) || (rating && (!Number.isInteger(Number(rating)) || Number(rating)<1 || Number(rating)>10))) throw new Error('An IMDb watchlist record is incomplete or invalid. Nothing was imported.');
    return {title,year,hint,date:null,externalIds:{imdb},eventId:`watchlist:${imdb}`,
      rating: rating ? Number(rating) : null, ratedAt: value(row,'Date Rated') || null, listNote:value(row,'Description') || null,
      destination:{kind:'watchlist',key:'imdb:watchlist',name:'Watchlist'}};
  });
}
