import { MEDIA } from './copy/media.js';

// Release and streaming countdowns, shared by web and iPhone so the two can't
// drift. Web shows `label` as a Tag (apps/web/src/utils/countdown.js); both
// apps use `phrase` in captions ("Out tomorrow", "Streaming in 3 days").

/**
 * @typedef {'past'|'today'|'tomorrow'|'soon'|'later'} CountdownStage
 * @typedef {{ stage: CountdownStage, days: number, label: string, phrase: string }} Countdown
 */

/**
 * @param {string | null | undefined} dateStr  YYYY-MM-DD
 * @param {Date} [now]
 * @returns {Countdown | null}
 */
export function releaseCountdown(dateStr, now = new Date()) {
  if (!dateStr) return null;
  // YYYY-MM-DD as local midnight, so the UTC offset can't shift the day.
  const [y, m, day] = dateStr.split('-').map(Number);
  if (!y || !m || !day) return null;
  const today = new Date(now); today.setHours(0, 0, 0, 0);
  const d = new Date(y, m - 1, day);
  const days = Math.round((d.getTime() - today.getTime()) / 86400000);
  const date = d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  if (days < 0) return { stage: 'past', days, label: MEDIA.released, phrase: MEDIA.released.toLowerCase() };
  if (days === 0) return { stage: 'today', days, label: MEDIA.today, phrase: MEDIA.today.toLowerCase() };
  if (days === 1) return { stage: 'tomorrow', days, label: MEDIA.tomorrow, phrase: MEDIA.tomorrow.toLowerCase() };
  if (days <= 7) return { stage: 'soon', days, label: MEDIA.inDays(days), phrase: MEDIA.inDaysPhrase(days) };
  return { stage: 'later', days, label: date, phrase: date };
}

/**
 * The caption under a poster for something not out yet: a streaming date wins
 * over a release date. Null once both are past.
 *
 * @param {{ release_date?: string | null, streaming_date?: string | null }} item
 * @param {Date} [now]
 */
export function releaseCaption(item, now = new Date()) {
  const strm = releaseCountdown(item.streaming_date, now);
  if (strm && strm.stage !== 'past') return MEDIA.streamingWhen(strm.phrase);
  const rel = releaseCountdown(item.release_date, now);
  return rel && rel.stage !== 'past' ? MEDIA.outWhen(rel.phrase) : null;
}
