// Shared, pure helpers for parsing watch-history exports.
// Kept framework-free so they can be unit-tested directly (ImportView is .jsx).

/**
 * A single parsed row from a platform export, before TMDB resolution.
 *
 * @typedef {object} ParsedImportEntry
 * @property {string} title Raw title text as it appeared in the export.
 * @property {'movie' | 'tv' | 'unknown'} hint Best-guess media type. TMDB
 *   search is the source of truth; this only biases the lookup.
 * @property {string | null} [date] "YYYY-MM-DD", or null when the export had
 *   no usable date column. Use `watchedAtFor` rather than reading this
 *   directly when you need a definite watch date.
 */

/** @typedef {'netflix' | 'prime' | 'disney' | 'max' | 'apple' | 'letterboxd'} ImportPlatform */

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
  const dateIdx   = findCol(headers, 'watcheddate', 'date'); // prefer actual watch date over logged date
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
export function parsePlatform(platformId, text) {
  switch (platformId) {
    case 'netflix':    return parseNetflix(text);
    case 'prime':      return parsePrime(text);
    case 'disney':     return parseDisney(text);
    case 'max':        return parseMax(text);
    case 'apple':      return parseApple(text);
    case 'letterboxd': return parseLetterboxd(text);
    default:           return [];
  }
}

/**
 * Normalise a parsed entry's date into the history's watched_at format —
 * shared by the import write and every "already have this exact watch"
 * check so they agree on what counts as a duplicate. Entries with no date
 * in the source export fall back to today.
 *
 * @param {ParsedImportEntry} entry
 * @returns {string} "YYYY-MM-DD"
 */
export function watchedAtFor(entry) {
  return entry.date
    ? new Date(entry.date + 'T12:00:00').toISOString().slice(0, 10)
    : new Date().toISOString().slice(0, 10);
}
