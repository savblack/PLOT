import { normalizeMediaType, releaseDateFromItem, titleFromItem } from '../domain/media.js';

function yearFrom(value) {
  const match = String(value || '').match(/\d{4}/);
  return match ? Number(match[0]) : null;
}

export function selectTmdbMatch(results = [], entry = {}) {
  const mediaType = normalizeMediaType(entry.media_type ?? entry.type);
  const wantedYear = yearFrom(entry.year ?? entry.release_date ?? entry.first_air_date);
  const candidates = results.filter(result => {
    if (mediaType && result.media_type !== mediaType) return false;
    return result.media_type === 'movie' || result.media_type === 'tv';
  });

  if (wantedYear) {
    const exactYear = candidates.find(result => yearFrom(releaseDateFromItem(result)) === wantedYear);
    if (exactYear) return exactYear;
  }

  return candidates[0] || null;
}

export function dedupeByTmdbId(items = []) {
  const seen = new Set();
  return items.filter(item => {
    if (!item?.tmdb_id) return true;
    const key = `${item.media_type || 'unknown'}:${Number(item.tmdb_id)}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

export function mergeIntegrationSnapshot(existingItems = [], incomingItems = [], seenAt = new Date().toISOString()) {
  const incomingKeys = new Set(
    incomingItems.map(item => `${item.source || 'plex_watchlist'}:${item.external_id}`),
  );

  const merged = existingItems.map(item => {
    const key = `${item.source || 'plex_watchlist'}:${item.external_id}`;
    if (item.sync_state === 'active' && !incomingKeys.has(key)) {
      return { ...item, sync_state: 'stale' };
    }
    return item;
  });

  incomingItems.forEach(item => {
    const source = item.source || 'plex_watchlist';
    const key = `${source}:${item.external_id}`;
    const next = {
      ...item,
      source,
      sync_state: item.sync_state || 'active',
      match_state: item.match_state || (item.tmdb_id && item.media_type ? 'matched' : 'needs_review'),
      last_seen_at: seenAt,
    };
    const existingIndex = merged.findIndex(row => `${row.source || 'plex_watchlist'}:${row.external_id}` === key);
    if (existingIndex >= 0) merged[existingIndex] = { ...merged[existingIndex], ...next };
    else merged.push(next);
  });

  return merged;
}

export function buildPlexWatchlistOutboxPayload(item = {}) {
  return {
    tmdb_id: Number(item.tmdb_id ?? item.id),
    media_type: normalizeMediaType(item.media_type ?? item.type),
    title: titleFromItem(item) || null,
    poster_path: item.poster_path || null,
    release_date: releaseDateFromItem(item),
  };
}

export function integrationStatusForItem(items = [], tmdbId) {
  const rows = items.filter(item => Number(item.tmdb_id) === Number(tmdbId));
  return {
    sources: [...new Set(rows.map(item => item.source).filter(Boolean))],
    isWatched: rows.some(item => Boolean(item.watched_at)),
    needsReview: rows.some(item => item.match_state === 'needs_review' || item.match_state === 'unmatched'),
  };
}

export function plexConnectionState({ authStatus, integration, isBusy } = {}) {
  if (isBusy) return { key: 'syncing', label: 'Syncing' };
  if (authStatus === 'pending') return { key: 'waiting', label: 'Waiting for Plex sign-in' };
  if (authStatus === 'expired') return { key: 'expired', label: 'Plex sign-in expired' };
  if (integration?.last_error) return { key: 'needs_server', label: 'Needs Plex server access' };
  if (integration?.status === 'active') return { key: 'connected', label: 'Connected' };
  if (integration?.status === 'error') return { key: 'error', label: 'Sync error' };
  return { key: 'not_connected', label: 'Not connected' };
}
