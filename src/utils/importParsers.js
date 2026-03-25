// CSV import parsers for Netflix and Letterboxd watch history

function parseCSVLine(line) {
  const fields = [];
  let current = '';
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      if (inQuotes && line[i + 1] === '"') {
        current += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (ch === ',' && !inQuotes) {
      fields.push(current);
      current = '';
    } else {
      current += ch;
    }
  }
  fields.push(current);
  return fields;
}

function parseCSV(csvText) {
  const lines = csvText.trim().split(/\r?\n/);
  if (lines.length < 2) return { headers: [], rows: [] };
  const headers = parseCSVLine(lines[0]).map(h => h.trim());
  const rows = lines.slice(1)
    .filter(l => l.trim())
    .map(l => {
      const fields = parseCSVLine(l);
      return Object.fromEntries(headers.map((h, i) => [h, (fields[i] || '').trim()]));
    });
  return { headers, rows };
}

export function detectFormat(headers) {
  const lower = headers.map(h => h.toLowerCase());
  if (lower.includes('title') && lower.includes('date') && lower.length <= 3) return 'netflix';
  if (lower.includes('name') && lower.includes('letterboxd uri')) return 'letterboxd';
  return null;
}

function parseNetflixDate(str) {
  if (!str) return null;
  // Try DD/MM/YYYY
  const ddmmyyyy = str.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (ddmmyyyy) {
    const [, d, m, y] = ddmmyyyy;
    return `${y}-${m.padStart(2, '0')}-${d.padStart(2, '0')}`;
  }
  // Try MM/DD/YY
  const mmddyy = str.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2})$/);
  if (mmddyy) {
    const [, m, d, y] = mmddyy;
    const fullYear = parseInt(y) > 50 ? `19${y}` : `20${y}`;
    return `${fullYear}-${m.padStart(2, '0')}-${d.padStart(2, '0')}`;
  }
  return null;
}

function extractNetflixBaseTitle(title) {
  // Match "Show Name: Season X: ..." or "Show Name: Series X: ..."
  const match = title.match(/^(.+?):\s*(?:Season|Series)\s+\d/i);
  if (match) return { base: match[1].trim(), isTv: true };
  return { base: title.trim(), isTv: false };
}

export function parseNetflix(csvText) {
  const { rows } = parseCSV(csvText);
  const map = new Map(); // base title → entry

  for (const row of rows) {
    const raw = row['Title'] || row['title'] || '';
    if (!raw) continue;
    const dateStr = row['Date'] || row['date'] || '';
    const watched_at = parseNetflixDate(dateStr);
    const { base, isTv } = extractNetflixBaseTitle(raw);

    const existing = map.get(base);
    if (!existing) {
      map.set(base, {
        title: base,
        watched_at,
        media_type_hint: isTv ? 'tv' : null,
      });
    } else {
      // Keep most recent date
      if (watched_at && (!existing.watched_at || watched_at > existing.watched_at)) {
        existing.watched_at = watched_at;
      }
      // If any entry was TV, mark as TV
      if (isTv) existing.media_type_hint = 'tv';
    }
  }

  return Array.from(map.values());
}

export function parseLetterboxd(csvText) {
  const { rows } = parseCSV(csvText);
  const entries = [];

  for (const row of rows) {
    const name = row['Name'] || row['name'] || '';
    if (!name) continue;

    const year = row['Year'] || row['year'] || null;
    const ratingRaw = row['Rating'] || row['rating'] || '';
    const watchedDate = row['Watched Date'] || row['watched date'] || row['Date'] || '';

    let rating = null;
    if (ratingRaw) {
      const parsed = parseFloat(ratingRaw);
      if (!isNaN(parsed)) rating = Math.round(parsed);
    }

    entries.push({
      title: name,
      year: year ? parseInt(year) : null,
      rating,
      watched_at: watchedDate || null,
    });
  }

  return entries;
}
