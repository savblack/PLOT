// TMDB GET with retries, for jobs where a transient failure should not skip a
// film for the day.
//
// peopleFeedJob.ts's tmdbGet has no retry: one 429 or 5xx and that call is
// counted as a failure. That is fine for jobs that tolerate gaps; the
// streaming-arrival job would rather wait a moment, because a skipped film is a
// film not checked today (it is retried tomorrow, but the two-snapshot rule
// makes every missed day a day later for a real arrival).
//
// Retries only what is worth retrying: 429 (honouring Retry-After), 5xx and
// network errors. A 4xx such as 404 is the answer and is thrown straight away.

const TMDB_BASE = 'https://api.themoviedb.org/3';

export type RetryOptions = {
  attempts?: number;
  baseDelayMs?: number;
  /** Longest single wait, including a TMDB-requested Retry-After. */
  maxDelayMs?: number;
  fetchImpl?: typeof fetch;
  sleep?: (ms: number) => Promise<void>;
};

/** Seconds or an HTTP date from a Retry-After header, as milliseconds; null if absent or unusable. */
export function retryAfterMs(header: string | null, now = Date.now()): number | null {
  if (!header) return null;
  const seconds = Number(header);
  if (Number.isFinite(seconds) && seconds >= 0) return seconds * 1000;
  const date = Date.parse(header);
  return Number.isNaN(date) ? null : Math.max(0, date - now);
}

export async function tmdbGetWithRetry(path: string, key: string, options: RetryOptions = {}): Promise<any> {
  const {
    attempts = 3,
    baseDelayMs = 500,
    maxDelayMs = 5000,
    fetchImpl = fetch,
    sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms)),
  } = options;
  const url = `${TMDB_BASE}${path}${path.includes('?') ? '&' : '?'}api_key=${encodeURIComponent(key)}&language=en-US`;

  let lastError: Error | null = null;
  for (let attempt = 1; attempt <= attempts; attempt++) {
    let wait = Math.min(maxDelayMs, baseDelayMs * 2 ** (attempt - 1));
    try {
      const res = await fetchImpl(url);
      if (res.ok) return await res.json();
      // The path only: the URL carries the API key and must never reach a log.
      lastError = new Error(`TMDB ${path} failed (${res.status})`);
      if (res.status !== 429 && res.status < 500) throw lastError;
      const asked = retryAfterMs(res.headers.get('Retry-After'));
      if (asked !== null) wait = Math.min(maxDelayMs, asked);
    } catch (err) {
      if (err === lastError) throw err;
      // A network error or an unreadable body: worth another go.
      lastError = new Error(`TMDB ${path} failed (${err instanceof Error ? err.name : 'error'})`);
    }
    if (attempt < attempts) await sleep(wait);
  }
  throw lastError ?? new Error(`TMDB ${path} failed`);
}
