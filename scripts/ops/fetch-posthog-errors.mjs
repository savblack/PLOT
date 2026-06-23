/**
 * Fetch the top recurring unhandled exceptions from PostHog.
 *
 * Uses the stable HogQL query API over `$exception` events rather than the
 * error_tracking issues endpoint (whose shape drifts between PostHog versions).
 * Resolution "stickiness" is handled downstream by the fix loop (a closed PR for
 * a given fingerprint blocks re-opening) — so we don't depend on issue status here.
 *
 * Env:
 *   POSTHOG_PERSONAL_API_KEY  (required, scope: query:read)
 *   POSTHOG_PROJECT_ID        (default 471234 = PLOT)
 *   POSTHOG_HOST              (default https://us.posthog.com)
 *   ERROR_LOOKBACK_DAYS       (default 7)
 *   ERROR_MIN_COUNT           (default 5)
 *   ERROR_MAX_PER_RUN         (default 1)
 *
 * Exports fetchTopErrors(); when run directly, prints the candidates as JSON.
 */

import { createHash } from 'node:crypto';

const HOST = (process.env.POSTHOG_HOST || 'https://us.posthog.com').replace(/\/$/, '');
const PROJECT_ID = process.env.POSTHOG_PROJECT_ID || '471234'; // PLOT project (NOT 31387 = Summ)
const LOOKBACK_DAYS = Number(process.env.ERROR_LOOKBACK_DAYS || 7);
const MIN_COUNT = Number(process.env.ERROR_MIN_COUNT || 5);
const MAX_PER_RUN = Number(process.env.ERROR_MAX_PER_RUN || 1);

/** Strip volatile bits so similar messages group to one fingerprint. */
function normalizeMessage(message) {
  return String(message || '')
    .toLowerCase()
    .replace(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/g, '<uuid>')
    .replace(/0x[0-9a-f]+/g, '<hex>')
    .replace(/\d+/g, '<n>')
    .replace(/(["'`]).*?\1/g, '<str>')
    .replace(/\s+/g, ' ')
    .trim();
}

function fingerprintFor(type, message) {
  return createHash('sha1').update(`${type}|${normalizeMessage(message)}`).digest('hex');
}

async function runHogQL(apiKey, query) {
  const res = await fetch(`${HOST}/api/projects/${PROJECT_ID}/query/`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ query: { kind: 'HogQLQuery', query } }),
  });
  const payload = await res.json().catch(() => null);
  if (!res.ok) {
    const detail = payload ? JSON.stringify(payload) : `status ${res.status}`;
    throw new Error(`PostHog query failed: ${detail}`);
  }
  return payload?.results || [];
}

export async function fetchTopErrors() {
  const apiKey = process.env.POSTHOG_PERSONAL_API_KEY;
  if (!apiKey) throw new Error('POSTHOG_PERSONAL_API_KEY is not set');

  // PostHog stores exception type/message as JSON-string arrays ($exception_types /
  // $exception_values) and exposes its own grouping key ($exception_fingerprint).
  // localhost is excluded so dev errors never reach the fix loop.
  // Column order is fixed by the SELECT below.
  const query = `
    SELECT
      JSONExtractString(properties.$exception_types, 1) AS type,
      JSONExtractString(properties.$exception_values, 1) AS message,
      properties.$exception_fingerprint AS ph_fingerprint,
      count() AS occurrences,
      max(timestamp) AS last_seen,
      any(properties.$current_url) AS sample_url
    FROM events
    WHERE event = '$exception'
      AND timestamp > now() - INTERVAL ${LOOKBACK_DAYS} DAY
      AND coalesce(properties.$current_url, '') NOT ILIKE '%localhost%'
      AND coalesce(properties.$current_url, '') NOT ILIKE '%127.0.0.1%'
    GROUP BY type, message, ph_fingerprint
    ORDER BY occurrences DESC
    LIMIT 50
  `;

  const rows = await runHogQL(apiKey, query);

  const candidates = rows
    .map(([type, message, phFingerprint, occurrences, lastSeen, sampleUrl]) => ({
      type: String(type || 'Error'),
      message: String(message || ''),
      occurrences: Number(occurrences) || 0,
      lastSeen: lastSeen ? String(lastSeen) : null,
      sampleUrl: sampleUrl ? String(sampleUrl) : null,
      // Prefer PostHog's own fingerprint; fall back to our normalized hash.
      fingerprint: phFingerprint ? String(phFingerprint) : fingerprintFor(type, message),
    }))
    .filter((c) => c.occurrences >= MIN_COUNT)
    // Collapse rows that normalize to the same fingerprint, summing counts.
    .reduce((acc, c) => {
      const existing = acc.get(c.fingerprint);
      if (existing) existing.occurrences += c.occurrences;
      else acc.set(c.fingerprint, c);
      return acc;
    }, new Map());

  return [...candidates.values()]
    .sort((a, b) => b.occurrences - a.occurrences)
    .slice(0, MAX_PER_RUN)
    .map((c) => ({
      ...c,
      shortFp: c.fingerprint.slice(0, 8),
      link: `${HOST}/project/${PROJECT_ID}/error_tracking`,
    }));
}

// Run directly: print candidates for inspection / dry runs.
if (import.meta.url === `file://${process.argv[1]}`) {
  fetchTopErrors()
    .then((errors) => {
      console.log(JSON.stringify(errors, null, 2));
      console.error(`Found ${errors.length} candidate(s) (min ${MIN_COUNT} occurrences over ${LOOKBACK_DAYS}d).`);
    })
    .catch((err) => {
      console.error(err.message);
      process.exit(1);
    });
}
