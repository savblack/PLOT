// Pure Brevo lifecycle payloads. No Supabase, no env. The edge function, the
// backfill script, and the unit tests all read this file so the event shape
// cannot drift from the contact attributes.

export const ONBOARDING_EVENT = 'onboarding_completed';
export const LIFECYCLE_LINK_SOURCE = 'lifecycle';
export const APP_ORIGIN = 'https://app.theplot.tv';
export const POSTER_BASE = 'https://image.tmdb.org/t/p/w342';

const TITLE_SLOTS = [1, 2, 3];

/**
 * Brevo date attributes store YYYY-MM-DD. Anything else is dropped, not rejected.
 * @param {unknown} value
 * @returns {string | undefined}
 */
export function brevoDate(value) {
  if (value == null || value === '') return undefined;
  const match = String(value).match(/^(\d{4}-\d{2}-\d{2})/);
  return match ? match[1] : undefined;
}

/**
 * @param {Iterable<unknown>} names
 * @param {number} [limit]
 * @returns {string}
 */
export function readableList(names, limit = 8) {
  const items = [];
  for (const name of names || []) {
    const text = String(name || '').trim();
    if (!text || items.includes(text)) continue;
    items.push(text);
    if (items.length >= limit) break;
  }
  if (items.length <= 1) return items[0] || '';
  if (items.length === 2) return `${items[0]} and ${items[1]}`;
  return `${items.slice(0, -1).join(', ')}, and ${items[items.length - 1]}`;
}

/**
 * @param {unknown} path
 * @returns {string | null}
 */
export function tmdbPosterUrl(path) {
  if (typeof path !== 'string' || !path.trim()) return null;
  if (/^https?:\/\//i.test(path)) return path;
  return `${POSTER_BASE}${path.startsWith('/') ? path : `/${path}`}`;
}

/**
 * @param {string | null | undefined} mediaType
 * @returns {'movie' | 'tv' | null}
 */
export function lifecycleMediaType(mediaType) {
  if (mediaType === 'movie') return 'movie';
  if (mediaType === 'tv' || mediaType === 'show' || mediaType === 'series') return 'tv';
  return null;
}

/**
 * Opens the title in the app. Web treats src=lifecycle as "open the panel",
 * not "add it to the watchlist again".
 * @param {{ tmdbId?: number|string, mediaType?: string, origin?: string }} [options]
 * @returns {string | null}
 */
export function titleDeepLink({ tmdbId, mediaType, origin = APP_ORIGIN } = {}) {
  const id = Number(tmdbId);
  const type = lifecycleMediaType(mediaType);
  if (!Number.isSafeInteger(id) || id <= 0 || !type) return null;
  let url;
  try {
    url = new URL('/save', origin);
  } catch {
    return null;
  }
  if (!['https:', 'http:'].includes(url.protocol)) return null;
  url.searchParams.set('media_type', type);
  url.searchParams.set('tmdb_id', String(id));
  url.searchParams.set('src', LIFECYCLE_LINK_SOURCE);
  return url.toString();
}

/**
 * Any /save link the mobile app is asked to open. Returns null when the URL
 * is not a title link.
 * @param {string | null | undefined} raw
 * @returns {{ tmdbId: number, mediaType: 'movie' | 'tv' } | null}
 */
export function parseTitleDeepLink(raw) {
  if (!raw || typeof raw !== 'string') return null;
  let parsed;
  try { parsed = new URL(raw); } catch { return null; }
  const path = parsed.pathname || '';
  const isSave = path === '/save' || path.endsWith('/save') || parsed.hostname === 'save';
  if (!isSave) return null;
  const id = Number(parsed.searchParams.get('tmdb_id'));
  const mediaType = lifecycleMediaType(parsed.searchParams.get('media_type'));
  if (!Number.isSafeInteger(id) || id <= 0 || !mediaType) return null;
  return { tmdbId: id, mediaType };
}

/**
 * @param {Array<{ name?: string, provider_name?: string } | string> | null | undefined} providers
 * @returns {string[]}
 */
export function streamingServiceNames(providers) {
  const names = [];
  for (const provider of providers || []) {
    const name = typeof provider === 'string' ? provider : (provider?.name || provider?.provider_name);
    const text = typeof name === 'string' ? name.trim() : '';
    if (!text || names.includes(text)) continue;
    names.push(text);
    if (names.length >= 8) break;
  }
  return names;
}

/**
 * A history row counts when the person marked it watched, rated it, stopped
 * partway, or wrote a note. A watching_progress row counts on its own: starting
 * a show and ticking an episode both write that table.
 * @param {{ watched_at?: unknown, rating?: unknown, dnf?: unknown, note?: unknown } | null | undefined} row
 */
export function isTrackedHistoryRow(row) {
  if (!row) return false;
  if (row.watched_at) return true;
  if (row.rating != null && row.rating !== '') return true;
  if (row.dnf) return true;
  return typeof row.note === 'string' && row.note.trim().length > 0;
}

function stamp(value) {
  if (value == null || value === '') return null;
  const text = String(value);
  if (/^\d{4}-\d{2}-\d{2}$/.test(text)) return `${text}T00:00:00.000Z`;
  const time = Date.parse(text);
  return Number.isNaN(time) ? null : new Date(time).toISOString();
}

/**
 * @param {Array<Record<string, unknown>> | null | undefined} historyRows
 * @param {Array<Record<string, unknown>> | null | undefined} progressRows
 * @returns {{ trackCount: number, lastTrackAt: string | null }}
 */
export function trackingSnapshot(historyRows, progressRows) {
  const keys = new Set();
  let last = null;
  const consider = (key, value) => {
    keys.add(key);
    const at = stamp(value);
    if (at && (!last || at > last)) last = at;
  };
  for (const row of historyRows || []) {
    if (!isTrackedHistoryRow(row)) continue;
    const type = lifecycleMediaType(String(row.media_type || ''));
    const id = Number(row.tmdb_id);
    if (!type || !Number.isSafeInteger(id) || id <= 0) continue;
    consider(`${type}:${id}`, row.updatedAt || row.updated_at || row.watched_at || row.created_at);
  }
  for (const row of progressRows || []) {
    const id = Number(row.tmdb_id);
    if (!Number.isSafeInteger(id) || id <= 0) continue;
    consider(`tv:${id}`, row.updated_at || row.started_at);
  }
  return { trackCount: keys.size, lastTrackAt: last ? last.slice(0, 10) : null };
}

/**
 * @param {Array<{ name?: string, poster_path?: string | null, tmdbId?: number, mediaType?: string }>} titles
 */
export function watchlistContactAttributes(titles) {
  const picked = (titles || []).filter(title => title?.name).slice(0, 3);
  /** @type {Record<string, string>} */
  const attributes = {
    SAVED_TITLES: readableList(picked.map(title => title.name), 3),
  };
  for (const slot of TITLE_SLOTS) {
    const title = picked[slot - 1];
    attributes[`TITLE_${slot}_NAME`] = title?.name || '';
    attributes[`TITLE_${slot}_POSTER_URL`] = title ? (tmdbPosterUrl(title.poster_path) || '') : '';
    attributes[`TITLE_${slot}_URL`] = title ? (titleDeepLink({ tmdbId: title.tmdbId, mediaType: title.mediaType }) || '') : '';
  }
  return attributes;
}

/**
 * Contact attributes the hourly sync writes. Dates are omitted when unknown
 * so a later sync does not blank a value Brevo already has.
 * @param {{ trackCount?: number, lastTrackAt?: string | null, lastSeenAt?: unknown, imported?: boolean, titles?: Array<{ name?: string, poster_path?: string | null, tmdbId?: number, mediaType?: string }> }} input
 */
export function lifecycleAttributes({ trackCount = 0, lastTrackAt = null, lastSeenAt = null, imported = false, titles = [] } = {}) {
  /** @type {Record<string, string | number | boolean>} */
  const attributes = {
    TRACK_COUNT: Number(trackCount) || 0,
    IMPORTED: !!imported,
    ...watchlistContactAttributes(titles),
  };
  const track = brevoDate(lastTrackAt);
  const seen = brevoDate(lastSeenAt);
  if (track) attributes.LAST_TRACK_AT = track;
  if (seen) attributes.LAST_SEEN_AT = seen;
  return attributes;
}

/**
 * @param {{ completedAt?: unknown, titles?: Array<{ name?: string, poster_path?: string | null, tmdbId?: number, mediaType?: string }>, imported?: boolean }} input
 */
export function onboardingContactProperties({ completedAt, titles = [], imported = false } = {}) {
  /** @type {Record<string, string | boolean>} */
  const attributes = {
    IMPORTED: !!imported,
    ...watchlistContactAttributes(titles),
  };
  const date = brevoDate(completedAt);
  if (date) attributes.ONBOARDING_COMPLETED_AT = date;
  return attributes;
}

/**
 * Flat event properties. Brevo automation templates read these by name.
 * Day-1 mail should read the contact attributes instead: import usually
 * finishes after this event, and the watchlist can change before the wait ends.
 * @param {{ titles?: Array<{ name?: string, poster_path?: string | null, tmdbId?: number, mediaType?: string }>, imported?: boolean, pickedCount?: number, providers?: Array<{ name?: string, provider_name?: string } | string> }} input
 */
export function onboardingEventProperties({ titles = [], imported = false, pickedCount = 0, providers = [] } = {}) {
  /** @type {Record<string, string | number | boolean>} */
  const properties = {
    imported: !!imported,
    picked_count: Number(pickedCount) || 0,
    streaming_services: readableList(streamingServiceNames(providers), 8),
  };
  (titles || []).filter(title => title?.name).slice(0, 3).forEach((title, index) => {
    const slot = index + 1;
    properties[`title_${slot}_name`] = title.name;
    const poster = tmdbPosterUrl(title.poster_path);
    if (poster) properties[`title_${slot}_poster_url`] = poster;
    const link = titleDeepLink({ tmdbId: title.tmdbId, mediaType: title.mediaType });
    if (link) properties[`title_${slot}_url`] = link;
  });
  return properties;
}

/**
 * A blacklisted contact stays blacklisted. Omit list ids so the upsert cannot
 * look like a resubscribe. Missing contacts (null) are new and may be listed.
 * @param {{ emailBlacklisted?: boolean } | null | undefined} contact
 * @param {number[] | undefined} listIds
 * @returns {number[] | undefined}
 */
export function listIdsForContact(contact, listIds) {
  if (contact?.emailBlacklisted) return undefined;
  return listIds?.length ? listIds : undefined;
}

/**
 * Blacklisted contacts are not entered into the onboarding automation.
 * Brevo would also refuse to mail them. Skipping the event means a later
 * key fix cannot replay a welcome into a blocked inbox.
 * @param {{ emailBlacklisted?: boolean } | null | undefined} contact
 */
export function shouldSendOnboardingEvent(contact) {
  return !contact?.emailBlacklisted;
}

/**
 * 401 (dead key), 429, and 5xx are worth another try. A 400 is a bad payload
 * and would fail the same way on every retry.
 * @param {number | null | undefined} status Missing status is a network failure.
 */
export function isRetryableBrevoStatus(status) {
  if (status == null) return true;
  return status === 401 || status === 429 || status >= 500;
}
