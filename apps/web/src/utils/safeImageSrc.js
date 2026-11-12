// An image address the app is willing to put in an <img src>: a local preview
// of a file the person just picked (blob:), or an https address (a saved
// avatar in storage). Anything else (javascript:, data:, a bare string)
// comes back undefined, so the image simply does not render.
//
// The two previews that use this (Edit profile's photo, Feedback's
// screenshots) only ever hold URL.createObjectURL(file) or the stored avatar,
// so this changes nothing a person sees. It exists so the address is checked
// where it is used rather than trusted from wherever it came.

const ALLOWED = new Set(['blob:', 'https:']);

/**
 * @param {unknown} url
 * @returns {string | undefined}
 */
export function safeImageSrc(url) {
  if (typeof url !== 'string' || !url) return undefined;
  let parsed;
  try {
    parsed = new URL(url);
  } catch {
    return undefined;
  }
  return ALLOWED.has(parsed.protocol) ? parsed.href : undefined;
}
