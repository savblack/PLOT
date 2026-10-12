// Brevo events for the streaming prompt and the episode-alerts toast.
// Event names must match packages/core/alertBrevo.js. The function directory
// cannot import @plot/core (deploy uploads this folder only).

import { sendBrevoEvent } from './brevo.ts';

export const STREAMING_ALERT_SET = 'streaming_alert_set';
export const EPISODE_ALERT_SET = 'episode_alert_set';
export const APP_ORIGIN = 'https://app.theplot.tv';

export type AlertMediaType = 'movie' | 'tv';

export type AlertEventProperties = {
  title: string;
  title_id: number;
  media_type: AlertMediaType;
  title_url: string;
};

export function titleAlertUrl(mediaType: AlertMediaType, titleId: number): string {
  const url = new URL('/save', APP_ORIGIN);
  url.searchParams.set('media_type', mediaType);
  url.searchParams.set('tmdb_id', String(titleId));
  return url.toString();
}

export function normaliseAccountEmail(value: unknown): string | null {
  const email = String(value ?? '').trim().toLowerCase();
  if (!email || email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) return null;
  return email;
}

export type ParsedAlertEvent =
  | { ok: true; eventName: string; properties: AlertEventProperties }
  | { ok: false };

/** The client sends title, title_id, and media_type. title_url is built here. */
export function parseAlertEvent(body: unknown): ParsedAlertEvent {
  if (!body || typeof body !== 'object') return { ok: false };
  const row = body as Record<string, unknown>;
  const event = row.event;
  const mediaType = row.media_type;
  if (event === STREAMING_ALERT_SET) {
    if (mediaType !== 'movie') return { ok: false };
  } else if (event === EPISODE_ALERT_SET) {
    if (mediaType !== 'tv') return { ok: false };
  } else {
    return { ok: false };
  }
  const titleId = typeof row.title_id === 'number' ? row.title_id : Number(row.title_id);
  const title = String(row.title ?? '').trim();
  if (!title || title.length > 300 || !Number.isSafeInteger(titleId) || titleId < 1) return { ok: false };
  return {
    ok: true,
    eventName: event,
    properties: {
      title,
      title_id: titleId,
      media_type: mediaType,
      title_url: titleAlertUrl(mediaType, titleId),
    },
  };
}

type FetchLike = (input: string, init?: RequestInit) => Promise<Response>;

export async function postAlertBrevoEvent(args: {
  fetchImpl: FetchLike;
  apiKey: string;
  email: string;
  eventName: string;
  properties: AlertEventProperties;
}): Promise<{ ok: true } | { ok: false }> {
  try {
    await sendBrevoEvent({
      apiKey: args.apiKey,
      eventName: args.eventName,
      email: args.email,
      eventProperties: args.properties,
      fetchImpl: args.fetchImpl,
    });
    return { ok: true };
  } catch {
    return { ok: false };
  }
}

type Hit = { count: number; first: number };

/** In-memory and per isolate. A burst that stays on one isolate is what it catches. */
export function rateLimitHit(store: Map<string, Hit>, key: string, now: number, windowMs: number, max: number): boolean {
  const rec = store.get(key);
  if (!rec || now - rec.first > windowMs) {
    store.set(key, { count: 1, first: now });
    return false;
  }
  rec.count += 1;
  return rec.count > max;
}
