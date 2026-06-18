// Shared, pure helpers for parsing watch-history exports.
// Kept framework-free so they can be unit-tested directly (ImportView is .jsx).

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

export function normaliseDate(raw) {
  if (!raw) return null;
  const s = raw.trim();

  // ISO: YYYY-MM-DD or YYYY-MM-DDTHH...
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.slice(0, 10);

  // DD/MM/YYYY or MM/DD/YYYY
  const slashMatch = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/);
  if (slashMatch) {
    const [, a, b, y] = slashMatch;
    // If first segment > 12 it must be a day
    if (parseInt(a) > 12) return `${y}-${b.padStart(2,'0')}-${a.padStart(2,'0')}`;
    // Otherwise assume MM/DD/YYYY (Netflix default)
    return `${y}-${a.padStart(2,'0')}-${b.padStart(2,'0')}`;
  }

  // Try native parse as last resort
  const d = new Date(s);
  if (!isNaN(d)) return d.toISOString().slice(0, 10);
  return null;
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
      date: dateIdx !== -1 ? normaliseDate(r[dateIdx]) : null,
      year: /^\d{4}$/.test(yearRaw) ? yearRaw : null,
      rating: Number.isFinite(stars) && stars > 0 ? Math.round(stars * 2) : null,
      note: reviewRaw || null,
    };
  }).filter(Boolean);
}
