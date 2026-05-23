export const WATCHLIST_NAME = '__watchlist__';

export function normalizeMediaType(value) {
  if (value === 'show' || value === 'series') return 'tv';
  if (value === 'tv' || value === 'movie') return value;
  return null;
}

export function releaseYear(item = {}) {
  const value = item.release_date || item.first_air_date || item.year || item.originallyAvailableAt;
  if (!value) return null;
  const match = String(value).match(/\d{4}/);
  return match ? Number(match[0]) : null;
}

export function selectTmdbMatch(results = [], entry = {}) {
  const mediaType = normalizeMediaType(entry.media_type || entry.type);
  const wantedYear = releaseYear(entry);
  const candidates = results.filter(result => {
    if (mediaType && result.media_type !== mediaType) return false;
    return result.media_type === 'movie' || result.media_type === 'tv';
  });

  if (wantedYear) {
    const exactYear = candidates.find(result => releaseYear(result) === wantedYear);
    if (exactYear) return exactYear;
  }

  return candidates[0] || null;
}

export function dedupeByTmdbId(items = []) {
  const seen = new Set();
  return items.filter(item => {
    if (!item.tmdb_id) return true;
    const key = `${item.media_type || ''}:${item.tmdb_id}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

export function mergeIntegrationSnapshot(previous = [], incoming = [], now = new Date().toISOString()) {
  const incomingKeys = new Set(incoming.map(item => `${item.source}:${item.external_id}`));
  const next = previous.map(item => {
    const key = `${item.source}:${item.external_id}`;
    if (!incomingKeys.has(key) && item.sync_state === 'active') {
      return { ...item, sync_state: 'stale', updated_at: now };
    }
    return item;
  });

  for (const item of incoming) {
    const index = next.findIndex(existing =>
      existing.source === item.source && existing.external_id === item.external_id
    );
    const merged = {
      ...item,
      sync_state: item.sync_state || 'active',
      match_state: item.match_state || (item.tmdb_id ? 'matched' : 'unmatched'),
      last_seen_at: item.last_seen_at || now,
      updated_at: now,
    };
    if (index >= 0) next[index] = { ...next[index], ...merged };
    else next.push({ ...merged, created_at: now });
  }

  return next;
}

export function integrationStatusForItem(integrationItems = [], tmdbId) {
  if (!tmdbId) return null;
  const related = integrationItems.filter(item => item.tmdb_id === tmdbId);
  if (related.length === 0) return null;

  const availability = related.reduce((acc, item) => ({ ...acc, ...(item.availability || {}) }), {});
  const sources = [...new Set(related.map(item => item.source).filter(Boolean))];
  const hasError = related.some(item => item.sync_state === 'error');
  const isWatched = related.some(item => Boolean(item.watched_at));
  const needsReview = related.some(item => item.match_state === 'needs_review' || item.match_state === 'unmatched');

  return { availability, sources, hasError, isWatched, needsReview };
}

export function buildPlexWatchlistOutboxPayload(item = {}) {
  return {
    tmdb_id: item.tmdb_id || item.id,
    media_type: normalizeMediaType(item.media_type || (item.title ? 'movie' : 'tv')),
    title: item.title || item.name || null,
    poster_path: item.poster_path || null,
    release_date: item.release_date || item.first_air_date || null,
  };
}

export function plexConnectionState({ integration, isBusy = false, authStatus = null } = {}) {
  if (isBusy) return { key: 'syncing', label: 'Syncing' };
  if (authStatus === 'pending' || integration?.status === 'pending') {
    return { key: 'waiting', label: 'Waiting for Plex sign-in' };
  }
  if (integration?.status === 'active' && integration?.last_error) {
    return { key: 'needs_server', label: 'Needs Plex server access' };
  }
  if (integration?.status === 'active') {
    return { key: 'connected', label: 'Connected' };
  }
  if (authStatus === 'expired') return { key: 'expired', label: 'Plex sign-in expired' };
  if (integration?.status === 'error') return { key: 'error', label: 'Sync error' };
  return { key: 'not_connected', label: 'Not connected' };
}
