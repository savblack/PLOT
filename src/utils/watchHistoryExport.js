const WATCH_HISTORY_COLUMNS = [
  ['title', 'Title'],
  ['media_type', 'Type'],
  ['watched_at', 'Watched at'],
  ['rating', 'Rating'],
  ['dnf', 'Did not finish'],
  ['release_date', 'Release date'],
  ['note', 'Note'],
  ['tmdb_id', 'TMDB ID'],
  ['poster_path', 'Poster path'],
];

function csvCell(value) {
  if (value === null || value === undefined) return '';
  const normalized = String(value).replaceAll('"', '""');
  return /[",\n\r]/.test(normalized) ? `"${normalized}"` : normalized;
}

export function buildWatchHistoryCsv(entries = []) {
  const header = WATCH_HISTORY_COLUMNS.map(([, label]) => csvCell(label)).join(',');
  const rows = entries.map(entry =>
    WATCH_HISTORY_COLUMNS
      .map(([key]) => csvCell(key === 'dnf' ? Boolean(entry[key]) : entry[key]))
      .join(',')
  );

  return [header, ...rows].join('\n');
}

export function watchHistoryExportFilename(date = new Date()) {
  const stamp = date.toISOString().slice(0, 10);
  return `plot-watch-history-${stamp}.csv`;
}

export function downloadWatchHistoryCsv(entries = [], date = new Date()) {
  const csv = buildWatchHistoryCsv(entries);
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');

  link.href = url;
  link.download = watchHistoryExportFilename(date);
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}
