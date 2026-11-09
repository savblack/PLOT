// Edge-only admission policy. The website uses it before invoking Supabase.
export const WINDOW_MS = 60_000;
export const BLOCK_MS = 600_000;
export const MAX_REQUESTS = 5;

/**
 * @param {{ attempts: number[], blockedUntil: number } | null} previous
 * @param {number} now
 */
export function admit(previous, now) {
  if (previous && previous.blockedUntil > now) {
    return { allowed: false, state: previous, expiresAt: previous.blockedUntil, retryAfter: Math.ceil((previous.blockedUntil - now) / 1000) };
  }
  const attempts = (previous?.attempts || []).filter(time => time > now - WINDOW_MS);
  if (attempts.length >= MAX_REQUESTS) {
    const blockedUntil = now + BLOCK_MS;
    return { allowed: false, state: { attempts: [], blockedUntil }, expiresAt: blockedUntil, retryAfter: BLOCK_MS / 1000 };
  }
  attempts.push(now);
  return { allowed: true, state: { attempts, blockedUntil: 0 }, expiresAt: now + WINDOW_MS, retryAfter: 0 };
}
