import { normalizeMediaType } from './media.js';

// Public links must work for recipients without an installed app or a session.
export const SHARE_ORIGIN = 'https://app.theplot.tv';

function link(path, source, origin) {
  try {
    const base = new URL(origin);
    if (!['https:', 'http:'].includes(base.protocol)) return null;
    const url = new URL(path, base.origin);
    if (source) url.searchParams.set('src', source);
    return url;
  } catch { return null; }
}

/** @param {{tmdbId?: number|string, mediaType?: string, source?: string, origin?: string}} options */
export function buildTitleShareUrl({ tmdbId, mediaType, source = 'share', origin = SHARE_ORIGIN } = {}) {
  const id = Number(tmdbId);
  const type = normalizeMediaType(mediaType);
  if (!Number.isSafeInteger(id) || id <= 0 || !type) return null;
  const url = link('/save', '', origin);
  if (!url) return null;
  url.searchParams.set('media_type', type);
  url.searchParams.set('tmdb_id', String(id));
  if (source) url.searchParams.set('src', source);
  return url.toString();
}

/** @param {{listId?: string, source?: string, origin?: string}} options */
export function buildListShareUrl({ listId, source = 'list_share', origin = SHARE_ORIGIN } = {}) {
  if (!listId?.trim()) return null;
  return link(`/list/${encodeURIComponent(listId.trim())}`, source, origin)?.toString() || null;
}

/**
 * Sharing a profile also invites recipients into the existing follow-after-signup flow.
 * @param {{username?: string, origin?: string}} options
 */
export function buildProfileShareUrl({ username = '', origin = SHARE_ORIGIN } = {}) {
  const handle = username.trim().replace(/^@/, '');
  if (!handle) return null;
  const url = link(`/u/${encodeURIComponent(handle)}`, 'profile_share', origin);
  if (!url) return null;
  url.searchParams.set('ref', handle);
  return url.toString();
}
