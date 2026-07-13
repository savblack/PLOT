/**
 * Platform-specific parsers for streaming history exports.
 * Each parser returns a normalised array of { title, watchedAt, mediaType }.
 * mediaType is a best-guess hint — TMDB search is the source of truth.
 */

export type Platform = 'netflix' | 'prime' | 'disney' | 'max' | 'apple';

export interface RawEntry {
  title: string;
  watchedAt: string; // ISO date string YYYY-MM-DD
  mediaTypeHint: 'movie' | 'tv' | 'unknown';
}

// ── CSV helpers ───────────────────────────────────────────────────────

function parseCSV(text: string): string[][] {
  const rows: string[][] = [];
  let col = '';
  let row: string[] = [];
  let inQuote = false;

  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    const next = text[i + 1];

    if (inQuote) {
      if (ch === '"' && next === '"') { col += '"'; i++; }        // escaped quote
      else if (ch === '"') { inQuote = false; }
      else { col += ch; }
    } else {
      if (ch === '"') { inQuote = true; }
      else if (ch === ',') { row.push(col.trim()); col = ''; }
      else if (ch === '\n') { row.push(col.trim()); rows.push(row); row = []; col = ''; }
      else if (ch === '\r') { /* skip */ }
      else { col += ch; }
    }
  }
  if (col || row.length) { row.push(col.trim()); rows.push(row); }
  return rows.filter(r => r.some(c => c));
}

function headerIndex(headers: string[], ...candidates: string[]): number {
  for (const c of candidates) {
    const i = headers.findIndex(h => h.toLowerCase().replace(/[^a-z0-9]/g, '').includes(c.toLowerCase().replace(/[^a-z0-9]/g, '')));
    if (i !== -1) return i;
  }
  return -1;
}

// Normalise a date string into YYYY-MM-DD
function normDate(raw: string): string {
  if (!raw) return new Date().toISOString().slice(0, 10);
  // Already YYYY-MM-DD
  if (/^\d{4}-\d{2}-\d{2}/.test(raw)) return raw.slice(0, 10);
  // DD/MM/YYYY or MM/DD/YYYY — try both
  const slash = raw.split('/');
  if (slash.length === 3) {
    const [a, b, c] = slash.map(Number);
    // If first part > 12 it must be DD/MM/YYYY
    if (a > 12) return `${c}-${String(b).padStart(2,'0')}-${String(a).padStart(2,'0')}`;
    return `${c}-${String(a).padStart(2,'0')}-${String(b).padStart(2,'0')}`;
  }
  // Fall back: let Date parse it
  const d = new Date(raw);
  return isNaN(d.getTime()) ? new Date().toISOString().slice(0, 10) : d.toISOString().slice(0, 10);
}

// Strip Netflix-style episode suffixes: "Show: Season 2: Ep Title" → "Show"
// Returns { cleanTitle, isTV }
function stripEpisodeSuffix(raw: string): { cleanTitle: string; isTV: boolean } {
  const colonParts = raw.split(':');
  if (colonParts.length >= 2) {
    const second = colonParts[1].trim().toLowerCase();
    // Strong TV signals in the suffix
    if (/^(season|series|part|chapter|episode|ep\s*\d|s\d)/.test(second) || colonParts.length >= 3) {
      return { cleanTitle: colonParts[0].trim(), isTV: true };
    }
    // Weaker signal — might be a subtitle like "Movie: The Sequel"
    return { cleanTitle: colonParts[0].trim(), isTV: false };
  }
  return { cleanTitle: raw.trim(), isTV: false };
}

// ── Netflix ───────────────────────────────────────────────────────────
// Export from: netflix.com → Account → Viewing Activity → Download all
// Format: Title,Date
export function parseNetflix(text: string): RawEntry[] {
  const rows = parseCSV(text);
  if (rows.length < 2) return [];
  const headers = rows[0].map(h => h.toLowerCase());
  const tIdx = headerIndex(headers, 'title');
  const dIdx = headerIndex(headers, 'date');
  if (tIdx === -1) return [];

  return rows.slice(1).flatMap(row => {
    const raw = row[tIdx] ?? '';
    const date = normDate(row[dIdx] ?? '');
    if (!raw) return [];
    const { cleanTitle, isTV } = stripEpisodeSuffix(raw);
    return [{ title: cleanTitle, watchedAt: date, mediaTypeHint: isTV ? 'tv' : 'unknown' }];
  });
}

// ── Amazon Prime Video ─────────────────────────────────────────────────
// Export from: amazon.com → Account → Data Privacy → Request data → "Digital content" → PrimeVideo.WatchedContent.csv
// Format varies — common columns: Title, WatchedDate / DateWatched / Watched Date
export function parsePrime(text: string): RawEntry[] {
  const rows = parseCSV(text);
  if (rows.length < 2) return [];
  const headers = rows[0].map(h => h.toLowerCase().trim());
  const tIdx = headerIndex(headers, 'title', 'videotitle', 'content');
  const dIdx = headerIndex(headers, 'watcheddate', 'datewatched', 'watched', 'date');
  if (tIdx === -1) return [];

  return rows.slice(1).flatMap(row => {
    const raw = row[tIdx] ?? '';
    const date = normDate(row[dIdx] ?? '');
    if (!raw) return [];
    const { cleanTitle, isTV } = stripEpisodeSuffix(raw);
    return [{ title: cleanTitle, watchedAt: date, mediaTypeHint: isTV ? 'tv' : 'unknown' }];
  });
}

// ── Disney+ ───────────────────────────────────────────────────────────
// Export from: privacy.disneyplus.com → Request your data → WatchHistory.json
// Format: JSON array with contentTitle / seriesTitle / watchedAt fields
export function parseDisney(text: string): RawEntry[] {
  let data: any[];
  try { data = JSON.parse(text); } catch { return []; }
  if (!Array.isArray(data)) {
    // Sometimes wrapped: { data: [...] } or { watchHistory: [...] }
    const candidate = (data as any)?.data ?? (data as any)?.watchHistory ?? (data as any)?.WatchHistory;
    if (!Array.isArray(candidate)) return [];
    data = candidate;
  }

  return data.flatMap((item: any) => {
    const seriesTitle = item.seriesTitle || item.series_title || item.seriesName || '';
    const contentTitle = item.contentTitle || item.content_title || item.title || item.Title || '';
    const raw = (seriesTitle || contentTitle || '').trim();
    if (!raw) return [];
    const date = normDate(item.watchedAt || item.watched_at || item.timestamp || item.date || '');
    const isTV = !!seriesTitle;
    return [{ title: raw, watchedAt: date, mediaTypeHint: isTV ? 'tv' : 'unknown' }];
  });
}

// ── Max (HBO Max) ─────────────────────────────────────────────────────
// Export from: privacycenter.max.com → Download your data → MaxViewingHistory.csv
// Format: Title,Date Watched,Content Type  (or JSON)
export function parseMax(text: string): RawEntry[] {
  // Try JSON first
  try {
    const data = JSON.parse(text);
    const arr: any[] = Array.isArray(data) ? data
      : (data?.viewingHistory ?? data?.data ?? data?.items ?? []);
    if (arr.length > 0) {
      return arr.flatMap((item: any) => {
        const seriesTitle = item.seriesTitle || item.series || item.showTitle || '';
        const raw = (seriesTitle || item.title || item.Title || '').trim();
        if (!raw) return [];
        const date = normDate(item.watchedAt || item.date || item.Date || '');
        const isTV = !!seriesTitle || (item.type ?? '').toLowerCase().includes('episode');
        return [{ title: raw, watchedAt: date, mediaTypeHint: isTV ? 'tv' : 'unknown' }];
      });
    }
  } catch { /* not JSON, fall through to CSV */ }

  const rows = parseCSV(text);
  if (rows.length < 2) return [];
  const headers = rows[0].map(h => h.toLowerCase().trim());
  const tIdx = headerIndex(headers, 'title', 'show', 'content');
  const dIdx = headerIndex(headers, 'datewatched', 'watchdate', 'date');
  const typeIdx = headerIndex(headers, 'type', 'contenttype');
  if (tIdx === -1) return [];

  return rows.slice(1).flatMap(row => {
    const raw = row[tIdx] ?? '';
    const date = normDate(row[dIdx] ?? '');
    if (!raw) return [];
    const { cleanTitle, isTV: tvFromTitle } = stripEpisodeSuffix(raw);
    const typeStr = (row[typeIdx] ?? '').toLowerCase();
    const isTV = tvFromTitle || typeStr.includes('episode') || typeStr.includes('series') || typeStr === 'tv';
    return [{ title: cleanTitle, watchedAt: date, mediaTypeHint: isTV ? 'tv' : 'unknown' }];
  });
}

// ── Apple TV+ ─────────────────────────────────────────────────────────
// Export from: privacy.apple.com → Request a copy of your data → Apple TV & Purchases
// Format: JSON — PlayActivity.json or similar inside a ZIP
// Since we can't unzip on-device, users should extract the JSON file first
export function parseApple(text: string): RawEntry[] {
  let data: any;
  try { data = JSON.parse(text); } catch { return []; }

  // Apple exports are often { PlayHistory: [...] } or { items: [...] }
  const arr: any[] = Array.isArray(data) ? data
    : (data?.PlayHistory ?? data?.playHistory ?? data?.items ?? data?.Interactions ?? []);

  return arr.flatMap((item: any) => {
    const seriesTitle = item.Series_Title ?? item.seriesTitle ?? item.collection_description ?? '';
    const raw = (seriesTitle || (item.Item_Description ?? item.title ?? item.Title ?? '')).trim();
    if (!raw) return [];
    const date = normDate(item.Event_End_Timestamp ?? item.endTimestamp ?? item.date ?? item.Play_Date ?? '');
    const isTV = !!seriesTitle || (item.Media_Type ?? item.mediaType ?? '').toLowerCase().includes('episode');
    return [{ title: raw, watchedAt: date, mediaTypeHint: isTV ? 'tv' : 'unknown' }];
  });
}

// ── Dispatcher ────────────────────────────────────────────────────────

export function parseExport(platform: Platform, text: string): RawEntry[] {
  switch (platform) {
    case 'netflix': return parseNetflix(text);
    case 'prime':   return parsePrime(text);
    case 'disney':  return parseDisney(text);
    case 'max':     return parseMax(text);
    case 'apple':   return parseApple(text);
  }
}

// Deduplicate: keep one entry per cleaned title, most-recent date wins.
export function deduplicateEntries(entries: RawEntry[]): RawEntry[] {
  const map = new Map<string, RawEntry>();
  for (const e of entries) {
    const key = e.title.toLowerCase().trim();
    const existing = map.get(key);
    if (!existing || e.watchedAt > existing.watchedAt) map.set(key, e);
  }
  return Array.from(map.values());
}
