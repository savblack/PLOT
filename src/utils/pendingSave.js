import { readStorage, writeStorage, removeStorage } from './storage.js';
import { normalizeMediaType } from '../domain/media.js';

/**
 * A "pending save" is a title a logged-out (or just-arriving) user asked to add
 * to their watchlist from outside the app — the marketing newsletter or the
 * public chart page — via the /save deep link.
 *
 * The intent is stashed in localStorage so it survives the login / signup round
 * trip (including the email-confirmation hop, as long as it lands in the same
 * browser). Once the user reaches the authenticated app shell, the pending-save
 * processor drains it and performs the real watchlist add.
 */
const KEY = 'plot_pending_save';

// Ignore intents older than this — a save the user kicked off long ago shouldn't
// silently apply itself days later.
const TTL_MS = 24 * 60 * 60 * 1000; // 24h

// Where the save was triggered from (chart page, newsletter, …). Free-form but
// sanitised to a short slug so it's safe to forward into a PostHog event.
function sanitizeSource(value) {
  if (typeof value !== 'string') return null;
  const slug = value.toLowerCase().replace(/[^a-z0-9_-]/g, '').slice(0, 40);
  return slug || null;
}

/** Validate + normalise a raw {tmdb_id, media_type, source}. Returns null if invalid. */
export function normalizePendingSave({ tmdb_id, media_type, source } = {}) {
  const id = Number(tmdb_id);
  if (!Number.isInteger(id) || id <= 0) return null;
  const type = normalizeMediaType(media_type);
  if (!type) return null;
  const intent = { tmdb_id: id, media_type: type };
  const src = sanitizeSource(source);
  if (src) intent.source = src;
  return intent;
}

/** Persist an intended save. Returns the normalised intent, or null if invalid. */
export function writePendingSave(intent) {
  const normalized = normalizePendingSave(intent);
  if (!normalized) return null;
  writeStorage(KEY, JSON.stringify({ ...normalized, ts: Date.now() }));
  return normalized;
}

/** Read a fresh, valid pending save (or null). Expired/corrupt entries are cleared. */
export function readPendingSave() {
  const raw = readStorage(KEY);
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw);
    const normalized = normalizePendingSave(parsed);
    if (!normalized) { clearPendingSave(); return null; }
    if (!parsed.ts || (Date.now() - parsed.ts) > TTL_MS) { clearPendingSave(); return null; }
    return normalized;
  } catch {
    clearPendingSave();
    return null;
  }
}

export function clearPendingSave() {
  removeStorage(KEY);
}
