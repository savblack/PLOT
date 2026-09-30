/** Fetch complete Trakt collections. A failed page fails the whole read, so a
 * caller cannot mistake a truncated history for a successful reconciliation.
 * Page consumers can persist checkpoints without retaining the whole response.
 */
export async function readTraktPages(
  path: string,
  request: (path: string) => Response | Promise<Response>,
  onPage?: (items: Record<string, unknown>[], nextPage: number | null) => void | Promise<void>,
): Promise<Record<string, unknown>[]> {
  const url = new URL(path, 'https://api.trakt.tv');
  const all: Record<string, unknown>[] = [];
  const limit = 100;
  url.searchParams.set('limit', String(limit));
  for (let page = 1; ; page++) {
    url.searchParams.set('page', String(page));
    const response = await request(url.pathname + url.search);
    if (!response.ok) throw new Error(`Trakt page ${page} failed (${response.status})`);
    const items = await response.json();
    if (!Array.isArray(items) || items.some(item => !item || typeof item !== 'object' || Array.isArray(item))) throw new Error('Trakt returned an unsupported collection');
    const countHeader = response.headers.get('X-Pagination-Page-Count');
    const count = countHeader == null ? null : Number(countHeader);
    if (count != null && (!Number.isSafeInteger(count) || count < 0)) {
      throw new Error('Trakt returned invalid pagination');
    }
    const done = count == null ? items.length < limit : page >= count;
    if (!done && !items.length) throw new Error('Trakt returned an incomplete page');
    await onPage?.(items, done ? null : page + 1);
    if (!onPage) all.push(...items);
    if (done) return all;
  }
}
