/**
 * In-app Premium explore links. Checkout stays closed; these only open /pricing
 * and optionally return the visitor to the screen they left.
 */

/** @param {string | null | undefined} from */
export function premiumPlansPath(from) {
  const safe = safeAppReturnPath(from, null);
  if (!safe) return '/pricing';
  return `/pricing?${new URLSearchParams({ from: safe })}`;
}

const hasControlChar = (value) => [...value].some((char) => char.charCodeAt(0) < 32 || char.charCodeAt(0) === 127);

/**
 * Only same-app relative paths. Rejects protocol-relative URLs, schemes, and
 * anything that is not a rooted app path.
 * @param {string | null | undefined} from
 * @param {string | null} [fallback='/']
 */
export function safeAppReturnPath(from, fallback = '/') {
  if (typeof from !== 'string') return fallback;
  const trimmed = from.trim();
  if (!trimmed.startsWith('/') || trimmed.startsWith('//')) return fallback;
  // URL parsers treat backslashes as slashes on HTTP origins. Reject encoded
  // separators too, including nested encodings that another layer may decode.
  let decoded = trimmed;
  while (decoded.includes('%')) {
    let next;
    try { next = decodeURIComponent(decoded); } catch { return fallback; }
    if (next === decoded) break;
    decoded = next;
    if (decoded.includes('\\') || decoded.startsWith('//') || hasControlChar(decoded)) return fallback;
  }
  if (decoded.includes('\\') || hasControlChar(decoded)) return fallback;
  try {
    if (new URL(trimmed, 'https://app.theplot.tv').origin !== 'https://app.theplot.tv') return fallback;
  } catch {
    return fallback;
  }
  return trimmed;
}
