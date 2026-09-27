/**
 * Small, best-effort PostHog HTTP capture helper for server-side events.
 *
 * The project token is write-only and is already used by the server-rendered
 * PostHog snippets. Keep the event properties supplied by each caller
 * deliberately small and PII-free.
 */
const POSTHOG_TOKEN = 'phc_uS3JEJC7s6T2WdsQToCZA3eRjLNakgc3EF3YPbza9Q6U';
const POSTHOG_ENDPOINT = 'https://a.theplot.tv/i/v0/e/';

export function normaliseCurrency(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const currency = value.trim().toUpperCase();
  return /^[A-Z]{3}$/.test(currency) ? currency : null;
}

export function normaliseMajorAmount(value: unknown): number | null {
  const amount = typeof value === 'number'
    ? value
    : typeof value === 'string'
      ? Number(value.replace(/,/g, '').trim())
      : Number.NaN;
  return Number.isFinite(amount) ? amount : null;
}

export async function capturePostHogEvent(
  event: string,
  distinctId: string,
  properties: Record<string, unknown>,
  timestamp?: string,
) {
  const response = await fetch(POSTHOG_ENDPOINT, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      api_key: POSTHOG_TOKEN,
      event,
      properties: { distinct_id: distinctId, ...properties },
      ...(timestamp ? { timestamp } : {}),
    }),
  });
  if (!response.ok) throw new Error(`PostHog capture returned ${response.status}`);
}
