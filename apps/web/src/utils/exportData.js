export async function parseExportError(response) {
  const fallback = 'Failed to export your data.';

  try {
    const payload = await response.json();
    if (payload?.error) return payload.error;
  } catch {
    // Fall through to raw text if the response body is not JSON.
  }

  try {
    const text = await response.text();
    if (text) return text;
  } catch {
    // Keep the default message when the response body cannot be read.
  }

  return fallback;
}

export async function fetchUserDataExport({
  supabase,
  fetchImpl,
  exportUrl,
}) {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) {
    return {
      ok: false,
      error: 'Your session has expired. Please sign in again before exporting your data.',
    };
  }

  if (!exportUrl) {
    return {
      ok: false,
      error: 'Data export is not configured in this environment.',
    };
  }

  const response = await fetchImpl(exportUrl, {
    method: 'POST',
    headers: { Authorization: `Bearer ${session.access_token}` },
  });

  if (!response.ok) {
    return { ok: false, error: await parseExportError(response) };
  }

  const payload = await response.json();
  return { ok: true, payload };
}

export function exportFilename(date = new Date()) {
  const stamp = date.toISOString().slice(0, 10);
  return `plot-data-export-${stamp}.json`;
}

export function exportCsvFilename(date = new Date()) {
  const stamp = date.toISOString().slice(0, 10);
  return `plot-data-export-${stamp}.csv`;
}

function triggerDownload(blob, filename) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

export function downloadDataExport(payload, filename = exportFilename()) {
  const content = JSON.stringify(payload, null, 2);
  const blob = new Blob([content], { type: 'application/json;charset=utf-8' });
  triggerDownload(blob, filename);
}

// The export payload is a bag of tables with different shapes. For CSV we
// flatten the title-bearing collections into one row-per-item sheet, keyed by
// the media columns every one of them shares (tmdb_id / media_type / title).
// Anything without those columns (raw settings, follows, integration rows) stays
// in the JSON export only — a single flat CSV can't represent it faithfully.
const CSV_SECTIONS = [
  { table: 'list_items',             section: 'Watchlist',   date: (r) => r.created_at || r.added_at },
  { table: 'journal',                section: 'History',     date: (r) => r.watched_at },
  { table: 'watching_progress',      section: 'Watching',    date: (r) => r.updated_at || r.started_at },
  { table: 'user_favourites',        section: 'Favourites',  date: (r) => r.added_at || r.created_at },
  { table: 'user_top_lists',         section: 'Top list',    date: (r) => r.added_at || r.created_at },
  { table: 'user_custom_list_items', section: 'Custom list', date: (r) => r.added_at || r.created_at },
];

const CSV_HEADERS = ['Section', 'Title', 'Type', 'TMDB ID', 'Rating', 'Watched on', 'Season', 'Episode', 'Date', 'Note'];

function csvCell(value) {
  if (value === null || value === undefined) return '';
  const s = String(value);
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export function buildExportCsv(payload) {
  const data = payload?.data ?? {};
  const rows = [CSV_HEADERS];
  for (const { table, section, date } of CSV_SECTIONS) {
    for (const r of data[table] ?? []) {
      rows.push([
        section,
        r.title,
        r.media_type,
        r.tmdb_id,
        r.rating,
        r.watched_at,
        r.current_season,
        r.current_episode,
        date(r),
        r.note,
      ]);
    }
  }
  return rows.map((cols) => cols.map(csvCell).join(',')).join('\r\n');
}

export function downloadCsvExport(payload, filename = exportCsvFilename()) {
  // Prepend a UTF-8 BOM so Excel opens accented titles correctly.
  const blob = new Blob(['\uFEFF' + buildExportCsv(payload)], { type: 'text/csv;charset=utf-8' });
  triggerDownload(blob, filename);
}
