import { canUseDOM } from './storage.js';
import { normalizeMediaType } from '../domain/media.js';

/**
 * Sharing helpers — the app-wide primitive for "send this somewhere else".
 *
 * The first consumer is sharing a movie/show title, but nothing here is
 * title-specific beyond buildTitleShareUrl(); shareUrl() works for any link
 * (lists, public profiles, …) so future surfaces can reuse it.
 */

/**
 * Build the canonical shareable URL for a title.
 *
 * Reuses the existing /save deep link (see SavePage + usePendingSave): opening
 * a shared link routes the recipient into the app and offers to add the title
 * to their watchlist — whether they're logged in or out. That keeps a single
 * real code path for adding titles and makes the link auth-aware for free.
 *
 * Returns null for invalid input or when no origin can be resolved (SSR/tests
 * without an explicit `origin`).
 */
export function buildTitleShareUrl({ tmdbId, mediaType, source = 'share', origin } = {}) {
  const id = Number(tmdbId);
  const type = normalizeMediaType(mediaType);
  if (!Number.isInteger(id) || id <= 0 || !type) return null;

  const base = origin || (canUseDOM() ? window.location.origin : null);
  if (!base) return null;

  const params = new URLSearchParams({ media_type: type, tmdb_id: String(id) });
  if (source) params.set('src', source);
  return `${base}/save?${params.toString()}`;
}

/**
 * Share a link via the native share sheet when available, otherwise copy it to
 * the clipboard.
 *
 * Returns { ok, method } where method is 'share' | 'copy' | 'unavailable'.
 * User dismissal of the native sheet is reported as { ok:false, cancelled:true }
 * rather than an error, and never falls through to the clipboard.
 */
export async function shareUrl({ url, title, text } = {}) {
  if (!url || typeof navigator === 'undefined') return { ok: false, method: 'unavailable' };

  if (typeof navigator.share === 'function') {
    try {
      await navigator.share({ url, ...(title ? { title } : {}), ...(text ? { text } : {}) });
      return { ok: true, method: 'share' };
    } catch (err) {
      // AbortError = the user dismissed the sheet. Treat as a no-op, not a
      // failure, and don't silently copy behind their back.
      if (err?.name === 'AbortError') return { ok: false, method: 'share', cancelled: true };
      // Any other share error (e.g. NotAllowedError) falls through to clipboard.
    }
  }

  if (navigator.clipboard?.writeText) {
    try {
      await navigator.clipboard.writeText(url);
      return { ok: true, method: 'copy' };
    } catch {
      return { ok: false, method: 'copy' };
    }
  }

  return { ok: false, method: 'unavailable' };
}
