function normalizeMediaType(value) {
  if (value === 'show' || value === 'series') return 'tv';
  return value || null;
}

function yearFromItem(item) {
  const date = item?.release_date || item?.first_air_date || item?.date || '';
  const year = String(date).slice(0, 4);
  return /^\d{4}$/.test(year) ? Number(year) : null;
}

export function selectTmdbMatch(results = [], target = {}) {
  const wantedType = normalizeMediaType(target.media_type || target.type);
  const wantedYear = target.year ? Number(target.year) : null;
  const candidates = results.filter(result => result.media_type === 'movie' || result.media_type === 'tv');

  if (!candidates.length) return null;

  const typeMatches = wantedType
    ? candidates.filter(result => result.media_type === wantedType)
    : candidates;
  const pool = typeMatches.length ? typeMatches : candidates;

  if (wantedYear) {
    const yearMatch = pool.find(result => yearFromItem(result) === wantedYear);
    if (yearMatch) return yearMatch;
  }

  return pool[0] || null;
}

export function dedupeByTmdbId(items = []) {
  const seen = new Set();
  const result = [];

  for (const item of items) {
    if (!item?.tmdb_id) {
      result.push(item);
      continue;
    }

    const key = `${normalizeMediaType(item.media_type) || 'unknown'}:${item.tmdb_id}`;
    if (seen.has(key)) continue;
    seen.add(key);
    result.push(item);
  }

  return result;
}

export function mergeIntegrationSnapshot(existing = [], incoming = [], timestamp = new Date().toISOString()) {
  const activeIncomingIds = new Set(
    incoming
      .filter(item => item.source === 'plex_watchlist')
      .map(item => item.external_id)
      .filter(Boolean)
  );
  const nextByKey = new Map();

  for (const item of existing) {
    const key = `${item.source || ''}:${item.external_id || ''}`;
    const shouldMarkStale =
      item.source === 'plex_watchlist' &&
      item.sync_state === 'active' &&
      !activeIncomingIds.has(item.external_id);

    nextByKey.set(key, shouldMarkStale
      ? { ...item, sync_state: 'stale', updated_at: timestamp }
      : item
    );
  }

  for (const item of incoming) {
    const key = `${item.source || ''}:${item.external_id || ''}`;
    nextByKey.set(key, {
      ...nextByKey.get(key),
      ...item,
      match_state: item.match_state || (item.tmdb_id ? 'matched' : 'needs_review'),
      sync_state: item.sync_state || 'active',
      updated_at: timestamp,
    });
  }

  return [...nextByKey.values()];
}

export function buildPlexWatchlistOutboxPayload(item = {}) {
  const mediaType = normalizeMediaType(item.media_type || item.type);
  return {
    tmdb_id: item.tmdb_id || item.id || null,
    media_type: mediaType,
    title: item.title || item.name || null,
    poster_path: item.poster_path || null,
    release_date: item.release_date || item.first_air_date || null,
  };
}

export function integrationStatusForItem(items = [], tmdbId) {
  const matches = items.filter(item => Number(item.tmdb_id) === Number(tmdbId));
  return {
    sources: [...new Set(matches.map(item => item.source).filter(Boolean))],
    isWatched: matches.some(item => Boolean(item.watched_at)),
    needsReview: matches.some(item => item.match_state === 'needs_review'),
  };
}

export function plexConnectionState({ authStatus, integration, isBusy } = {}) {
  if (isBusy) return { key: 'syncing', label: 'Syncing' };
  if (authStatus === 'pending') return { key: 'waiting', label: 'Waiting for Plex sign-in' };
  if (authStatus === 'expired') return { key: 'expired', label: 'Plex sign-in expired' };
  if (integration?.status === 'active' && integration.last_error) {
    return { key: 'needs_server', label: 'Needs Plex server access' };
  }
  if (integration?.status === 'active') return { key: 'connected', label: 'Connected' };
  if (integration?.status === 'error') return { key: 'error', label: 'Sync error' };
  return { key: 'not_connected', label: 'Not connected' };
}
