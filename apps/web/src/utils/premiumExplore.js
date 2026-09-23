/**
 * In-app Premium explore links. Checkout stays closed; these only open /plans
 * and optionally return the visitor to the screen they left.
 */

/** @param {string | null | undefined} from */
export function premiumPlansPath(from) {
  const safe = safeAppReturnPath(from, null);
  if (!safe) return '/plans';
  return `/plans?${new URLSearchParams({ from: safe })}`;
}

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
  if (/^[a-z][a-z0-9+.-]*:/i.test(trimmed)) return fallback;
  return trimmed;
}
