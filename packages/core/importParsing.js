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
 * @property {string | null} [date] "YYYY-MM-DD", or null when the export had
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

// Slash dates (DD/MM/YYYY vs MM/DD/YYYY) are ambiguous whenever both segments
// are <= 12 — e.g. a UK export's "03/04/2024" (3 April) reads as US "March 4"
// unless we know the file's convention. `dayFirst` lets a caller pass that
// convention in (see detectDayFirst below); rows that are unambiguous on
// their own (a segment > 12) are always resolved correctly regardless.
export function normaliseDate(raw, { dayFirst = false } = {}) {
  if (!raw) return null;
  const s = raw.trim();

  // ISO: YYYY-MM-DD or YYYY-MM-DDTHH...
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.slice(0, 10);

  // DD/MM/YYYY or MM/DD/YYYY
  const slashMatch = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/);
  if (slashMatch) {
    const [, a, b, y] = slashMatch;
    // If first segment > 12 it must be a day, regardless of file convention
    if (parseInt(a) > 12) return `${y}-${b.padStart(2,'0')}-${a.padStart(2,'0')}`;
    if (parseInt(b) > 12) return `${y}-${a.padStart(2,'0')}-${b.padStart(2,'0')}`;
    // Ambiguous (both segments <= 12) — use the file-level convention,
    // defaulting to MM/DD/YYYY (Netflix default) when none was detected.
    if (dayFirst) return `${y}-${b.padStart(2,'0')}-${a.padStart(2,'0')}`;
    return `${y}-${a.padStart(2,'0')}-${b.padStart(2,'0')}`;
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
    const match = raw.trim().match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/);
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

/* ─────────────────── Streaming platform parsers ───────────────────
   Each returns an array of { title, hint, date } (Letterboxd adds year/
   rating/note). `hint` is 'tv' | 'movie' | 'unknown' — a guess the caller
   refines against TMDB. Previously inline in the web ImportView; lifted here
   so mobile can share them too. */

const TV_SEGMENT_RE = /^(season|series|part|episode|ep\s?\d|s\d)/i;

function stripNetflixEpisode(title) {
  const parts = title.split(':').map(p => p.trim());
  if (parts.length >= 3) return { title: parts[0], hint: 'tv' };
  if (parts.length === 2 && TV_SEGMENT_RE.test(parts[1])) return { title: parts[0], hint: 'tv' };
  return { title, hint: 'unknown' };
}

export function parseNetflix(text) {
  const rows = parseCSV(text);
  if (rows.length < 2) return [];
  const headers = rows[0];
  const titleIdx = findCol(headers, 'title', 'name');
  const dateIdx  = findCol(headers, 'date', 'watched', 'viewdate');
  if (titleIdx === -1) return [];
  const dayFirst = dateIdx !== -1 && detectDayFirst(rows.slice(1).map(r => r[dateIdx]));

  return rows.slice(1).map(r => {
    const raw = r[titleIdx]?.trim();
    if (!raw) return null;
    const { title, hint } = stripNetflixEpisode(raw);
    const date = dateIdx !== -1 ? normaliseDate(r[dateIdx], { dayFirst }) : null;
    return { title, hint, date };
  }).filter(Boolean);
}

export function parsePrime(text) {
  const rows = parseCSV(text);
  if (rows.length < 2) return [];
  const headers = rows[0];
  const titleIdx = findCol(headers, 'title', 'name', 'content');
  const dateIdx  = findCol(headers, 'watcheddate', 'date', 'watched', 'viewdate', 'lastwatched');
  if (titleIdx === -1) return [];
  const dayFirst = dateIdx !== -1 && detectDayFirst(rows.slice(1).map(r => r[dateIdx]));

  return rows.slice(1).map(r => {
    const title = r[titleIdx]?.trim();
    if (!title) return null;
    return { title, hint: 'unknown', date: dateIdx !== -1 ? normaliseDate(r[dateIdx], { dayFirst }) : null };
  }).filter(Boolean);
}

function unwrapJson(raw) {
  if (Array.isArray(raw)) return raw;
  for (const key of ['data', 'watchHistory', 'PlayHistory', 'items', 'Interactions', 'history']) {
    if (raw[key] && Array.isArray(raw[key])) return raw[key];
  }
  return [];
}

export function parseDisney(text) {
  const raw = JSON.parse(text);
  const items = unwrapJson(raw);
  return items.map(item => {
    const title = (item.seriesTitle || item.contentTitle || item.title || '').trim();
    if (!title) return null;
    const hint = item.seriesTitle ? 'tv' : 'unknown';
    const date = normaliseDate(item.watchedAt || item.date || item.timestamp);
    return { title, hint, date };
  }).filter(Boolean);
}

export function parseMax(text) {
  // Try JSON first, fall back to CSV
  try {
    const raw = JSON.parse(text);
    const items = unwrapJson(raw);
    return items.map(item => {
      const title = (item.Title || item.title || item.name || '').trim();
      if (!title) return null;
      const hint = (item['Content Type'] || item.contentType || item.type || '').toLowerCase().includes('series') ? 'tv' : 'unknown';
      const date = normaliseDate(item['Date Watched'] || item.dateWatched || item.date);
      return { title, hint, date };
    }).filter(Boolean);
  } catch {
    const rows = parseCSV(text);
    if (rows.length < 2) return [];
    const headers = rows[0];
    const titleIdx = findCol(headers, 'title', 'name');
    const dateIdx  = findCol(headers, 'datewatched', 'date', 'watched');
    const typeIdx  = findCol(headers, 'contenttype', 'type', 'content');
    if (titleIdx === -1) return [];
    const dayFirst = dateIdx !== -1 && detectDayFirst(rows.slice(1).map(r => r[dateIdx]));
    return rows.slice(1).map(r => {
      const title = r[titleIdx]?.trim();
      if (!title) return null;
      const typeVal = typeIdx !== -1 ? (r[typeIdx] || '').toLowerCase() : '';
      const hint = typeVal.includes('series') || typeVal.includes('tv') ? 'tv' : 'unknown';
      return { title, hint, date: dateIdx !== -1 ? normaliseDate(r[dateIdx], { dayFirst }) : null };
    }).filter(Boolean);
  }
}

export function parseApple(text) {
  const raw = JSON.parse(text);
  const items = unwrapJson(raw);
  return items.map(item => {
    const seriesTitle = item.Series_Title || item.series_title || '';
    const itemTitle   = item.Item_Description || item.title || '';
    const title = (seriesTitle || itemTitle).trim();
    if (!title) return null;
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
export function parsePlatform(platformId, text, { fileName = '' } = {}) {
  if (platformId === 'trakt' && fileName === 'lists-watchlist.json') return parseTraktWatchlist(text);
  if (platformId === 'imdb' && /^(imdb[_-])?watchlist\.csv$/i.test(fileName)) return parseImdbWatchlist(text);
  if (platformId === 'letterboxd') {
    const list = parseLetterboxdList(text, fileName);
    if (list) return list;
  }
  switch (platformId) {
    case 'trakt': return parseTraktHistory(text);
    case 'netflix':    return parseNetflix(text);
    case 'prime':      return parsePrime(text);
    case 'disney':     return parseDisney(text);
    case 'max':        return parseMax(text);
    case 'apple':      return parseApple(text);
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

/** IMDb movie ratings CSV, verified against the captured public export fixture.
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
    const type = row[column('Title Type')]?.trim().toLowerCase();
    const rating = Number(row[column('Your Rating')]);
    const year = row[column('Year')]?.trim();
    if (type !== 'movie') throw new Error('This IMDb file contains non-movie ratings. Only movie ratings are supported in this version.');
    if (!title || !/^tt\d+$/.test(imdb || '') || !Number.isInteger(rating) || rating < 1 || rating > 10 || !/^\d{4}$/.test(year || '')) {
      throw new Error('An IMDb rating record is incomplete or invalid. No records have been imported.');
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

/** Movie watchlist export, verified independently of IMDb's ratings export. */
export function parseImdbWatchlist(text) {
  const [headers = [], ...rows] = parseCSV(text.replace(/^\uFEFF/,''));
  const required = ['Position','Const','Created','Modified','Description','Title','URL','Title Type','Year','Your Rating','Date Rated'];
  if (required.some(name => !headers.includes(name)) || new Set(headers).size !== headers.length) throw new Error('Unsupported IMDb watchlist format.');
  const value = (row,name) => row[headers.indexOf(name)]?.trim() || '';
  return rows.filter(row => row.some(cell => cell.trim())).map(row => {
    const title=value(row,'Title'), imdb=value(row,'Const'), year=value(row,'Year'), rating=value(row,'Your Rating');
    if (value(row,'Title Type').toLowerCase() !== 'movie') throw new Error('This IMDb watchlist contains non-movie entries. This version supports movie watchlists only.');
    if (!title || !/^tt\d+$/.test(imdb) || !/^\d{4}$/.test(year) || (rating && (!Number.isInteger(Number(rating)) || Number(rating)<1 || Number(rating)>10))) throw new Error('An IMDb watchlist record is incomplete or invalid. Nothing was imported.');
    return {title,year,hint:'movie',date:null,externalIds:{imdb},eventId:`watchlist:${imdb}`,
      rating: rating ? Number(rating) : null, ratedAt: value(row,'Date Rated') || null, listNote:value(row,'Description') || null,
      destination:{kind:'watchlist',key:'imdb:watchlist',name:'Watchlist'}};
  });
}
