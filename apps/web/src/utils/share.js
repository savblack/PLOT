// Browser transport: native sheet and clipboard APIs are web-specific.
export { buildTitleShareUrl, buildListShareUrl, buildProfileShareUrl } from '@plot/core/sharing.js';

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
