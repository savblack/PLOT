// Rows the public title pages remember for the daily sitemap.
//
// The database write lives in record_title_page_index: a missing row is
// inserted, and an existing row is updated only when last_seen_at is older
// than 24 hours or the stored title changed. This module only dedupes the
// payload and keeps that write off the page response.

export type IndexedTitle = {
  media_type: 'movie' | 'tv';
  tmdb_id: number;
  title: string;
};

export function uniqueTitleIndexRows(rows: readonly IndexedTitle[]): IndexedTitle[] {
  const unique = new Map<string, IndexedTitle>();
  for (const row of rows) {
    if (row?.media_type !== 'movie' && row?.media_type !== 'tv') continue;
    if (!Number.isInteger(row.tmdb_id) || row.tmdb_id <= 0) continue;
    if (typeof row.title !== 'string') continue;
    const key = `${row.media_type}:${row.tmdb_id}`;
    if (!unique.has(key)) unique.set(key, row);
  }
  return [...unique.values()];
}

// Starts the write and returns immediately. waitUntil, when the edge runtime
// provides it, keeps the isolate alive until the promise settles. A rejection
// is swallowed here so a failed index write cannot fail the page.
export function scheduleTitleIndexWrite(
  rows: readonly IndexedTitle[],
  write: (rows: IndexedTitle[]) => PromiseLike<unknown>,
  waitUntil?: (promise: Promise<unknown>) => void,
): void {
  const unique = uniqueTitleIndexRows(rows);
  if (unique.length === 0) return;
  const pending = Promise.resolve()
    .then(() => write(unique))
    .then(() => undefined, () => undefined);
  if (waitUntil) waitUntil(pending);
}
