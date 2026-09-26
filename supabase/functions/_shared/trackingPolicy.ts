/** Pure provider validation and retry policy. Source event IDs, not title keys,
 * distinguish rewatches. Episode identifiers belong to their parent series. */
export function retryDelay(attempts: number, retryAfter: string | null = null, now = Date.now()) {
  const numeric = retryAfter == null ? NaN : Number(retryAfter);
  const hinted = Number.isFinite(numeric) ? numeric : retryAfter ? (Date.parse(retryAfter) - now) / 1000 : 0;
  return Math.ceil(Math.min(86400, Math.max(30, 30 * 2 ** Math.min(attempts, 10), Number.isFinite(hinted) ? hinted : 0)));
}

export function traktWatchRecord(input: unknown, account: string) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) return null;
  const raw = input as Record<string, unknown>;
  const movie = raw.type === 'movie';
  if (!movie && raw.type !== 'episode') return null;
  const media = raw[movie ? 'movie' : 'show'] as Record<string, unknown> | undefined;
  const ids = media?.ids as Record<string, unknown> | undefined;
  const episode = raw.episode as Record<string, unknown> | undefined;
  if (!account || !Number.isSafeInteger(raw.id) || Number(raw.id) <= 0 || !Number.isSafeInteger(ids?.tmdb) || Number(ids?.tmdb) <= 0 ||
      typeof media?.title !== 'string' || !media.title.trim()) return null;
  if (!movie && (!Number.isInteger(episode?.season) || Number(episode?.season) < 0 ||
      !Number.isInteger(episode?.number) || Number(episode?.number) < 1)) return null;
  const date = raw.watched_at == null ? null : String(raw.watched_at);
  if (date && (!/^\d{4}-\d{2}-\d{2}T.*(?:Z|[+-]\d{2}:\d{2})$/.test(date) || !Number.isFinite(Date.parse(date)) ||
    new Date(date.slice(0,10) + 'T00:00:00Z').toISOString().slice(0,10) !== date.slice(0,10))) return null;
  const event = {
    source: 'trakt', source_account: account, source_key: JSON.stringify(['trakt',account,'event',String(raw.id)]),
    tmdb_id: ids!.tmdb, media_type: movie ? 'movie' : 'tv',
    season_number: movie ? null : episode!.season, episode_number: movie ? null : episode!.number,
    watched_on: date?.slice(0,10) ?? null, watched_at: date, date_precision: date ? 'instant' : 'unknown',
    external_ids: { ...ids, episode: movie ? undefined : episode?.ids }, source_rating: null, source_review: null,
  };
  return { event, summary: { tmdb_id: ids!.tmdb, media_type: event.media_type, title: media!.title,
    watched_at: event.watched_on, poster_path: null, genre_ids: [] } };
}

/** Watchlist membership is not a watch. Stable source identity also prevents a
 * later sync from resurrecting an item the user removed from PLOT. */
export function traktWatchlistRecord(input: unknown, account: string, kind: 'movie'|'show') {
  if (!input || typeof input !== 'object' || Array.isArray(input)) return null;
  const raw = input as Record<string, unknown>;
  const media = raw[kind] as Record<string, unknown> | undefined;
  const ids = media?.ids as Record<string, unknown> | undefined;
  if (!account || !Number.isSafeInteger(ids?.tmdb) || Number(ids?.tmdb) <= 0 ||
      !Number.isSafeInteger(ids?.trakt) || Number(ids?.trakt) <= 0 || typeof media?.title !== 'string' || !media.title.trim()) return null;
  return { kind: 'watchlist', source: 'trakt', source_key: JSON.stringify(['trakt',account,'watchlist',kind,ids!.trakt]),
    summary: { tmdb_id: ids!.tmdb, media_type: kind === 'movie' ? 'movie' : 'tv', title: media!.title, poster_path: null } };
}
