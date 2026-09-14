// What one post actually looks like on one platform, and when it should land.
//
// Split out of publish.mjs because two steps now need to agree about it:
// schedule.mjs builds the payload to push into Buffer, and reconcile.mjs
// compares what came back against what we sent. When the composing lived inside
// the publish loop there was only one caller and no way to test it without a
// Buffer key; as a pure function it is exercised directly by
// marketing/tests/publish-payload.test.mjs.

import { publicUrl } from '../lib/storage.mjs';
import { chartUrl } from '../lib/feed.mjs';

/** Our platform name -> Buffer's service name. */
export const SERVICE = { x: 'twitter', instagram: 'instagram', threads: 'threads' };

/**
 * The hour, in Sydney, that a post goes out.
 *
 * This used to be implicit, and everything written down about it was wrong. The
 * publish cron said `0 2 * * *` with a comment reading "12:00pm Sydney", and
 * swept up whatever was already due — so the send time was a property of the
 * workflow schedule, not of the post. But GitHub's scheduler is best-effort, and
 * this repo's crons run 2.5-5.5 hours behind their stated time, consistently:
 * ten consecutive publish runs all started ~07:10 UTC, never 02:00. Posts have
 * actually been landing about **17:15 Sydney**.
 *
 * It is now only a FALLBACK. The real times come from each channel's own posting
 * schedule in Buffer (see sendTimeFor); this is what a channel with no schedule
 * for that weekday gets. Buffer honours the time it is given either way, which
 * is why moving to Buffer changed when posts land, not just what sends them.
 */
export const SEND_HOUR_SYDNEY = 12;
const TZ = 'Australia/Sydney';

// Cards can be limited to specific platforms (media[i].channels); null = all.
const cardsFor = (media, channel) => media.filter((m) => !m.channels || m.channels.includes(channel));

/**
 * The Sydney calendar day a post belongs to.
 *
 * NOT `scheduled_for.slice(0, 10)`. The planner schedules at 23:30 UTC, which is
 * already the next morning in Sydney, so slicing the UTC string names the day
 * before the one the post is actually for — every post, not an edge case. This
 * matches dueDateFor() in supabase/functions/_shared/linearIssue.js, so the card
 * and the Buffer post agree about what day it is.
 */
export const sydneyDay = (post) =>
  new Date(post.scheduled_for).toLocaleDateString('en-CA', { timeZone: TZ });

/** A zone's UTC offset, in ms, at a given instant. Handles DST by asking. */
const offsetMsAt = (instant, timeZone) => {
  const parts = new Intl.DateTimeFormat('en-US', { timeZone, timeZoneName: 'longOffset' })
    .formatToParts(instant);
  const name = parts.find((p) => p.type === 'timeZoneName')?.value ?? 'GMT+00:00';
  const m = /GMT([+-])(\d{2}):(\d{2})/.exec(name);
  if (!m) return 0;
  return (m[1] === '-' ? -1 : 1) * (Number(m[2]) * 60 + Number(m[3])) * 60_000;
};

/**
 * The UTC instant for a wall-clock time on a given calendar day in a zone.
 *
 * Resolved against the zone rather than by adding a fixed offset, because Sydney
 * is UTC+10 for half the year and UTC+11 for the other half, and a week
 * generated across the changeover in early October would otherwise be an hour
 * out on one side of it. The offset is looked up twice — once at the naive
 * guess, once at the answer — which is what makes the changeover day itself
 * correct.
 */
const zonedInstant = (day, hour, minute, timeZone) => {
  const [y, m, d] = day.split('-').map(Number);
  const wallClock = Date.UTC(y, m - 1, d, hour, minute, 0);
  let instant = wallClock - offsetMsAt(new Date(wallClock), timeZone);
  instant = wallClock - offsetMsAt(new Date(instant), timeZone);
  return new Date(instant);
};

/** 'mon'...'sun' for a YYYY-MM-DD day, matching Buffer's schedule keys. */
const WEEKDAYS = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'];
export const weekdayKey = (day) => {
  const [y, m, d] = day.split('-').map(Number);
  return WEEKDAYS[new Date(Date.UTC(y, m - 1, d)).getUTCDay()];
};

// Two posts for the same channel on the same day must not land on the same
// minute. When a day has more posts than Buffer has slots, the extras are spaced
// out after the last one rather than stacked on it — a channel with two slots
// and three posts would otherwise fire two simultaneously, which reads as a bot
// and, on Instagram, risks the second being dropped.
const OVERFLOW_GAP_MINUTES = 45;

/**
 * When this post should be sent, and why.
 *
 * The DAY is ours: it comes from the post's own schedule, and the copy is
 * written against it. The TIME is Buffer's: each channel carries a posting
 * schedule of the hours Buffer recommends for that service on that weekday, and
 * the nth post for a channel on a day takes the nth slot.
 *
 * @param {object} post     a marketing_posts row
 * @param {object} [slots]  that channel's schedule: {timezone, byDay}
 * @param {number} [index]  how many posts this channel already has that day
 * @returns {Date}
 */
export const sendTimeFor = (post, slots, index = 0) => {
  const day = sydneyDay(post);
  const timeZone = slots?.timezone || TZ;
  const times = slots?.byDay?.[weekdayKey(day)] ?? [];

  // No schedule for this channel or this weekday — fall back to the house hour.
  if (!times.length) return zonedInstant(day, SEND_HOUR_SYDNEY, 0, timeZone);

  if (index < times.length) {
    const [hh, mm] = times[index].split(':').map(Number);
    return zonedInstant(day, hh, mm, timeZone);
  }

  const [hh, mm] = times[times.length - 1].split(':').map(Number);
  const overflow = (index - times.length + 1) * OVERFLOW_GAP_MINUTES;
  return new Date(zonedInstant(day, hh, mm, timeZone).getTime() + overflow * 60_000);
};

/**
 * Compose one post for one platform.
 *
 * @param {object} post      a marketing_posts row
 * @param {string} platform  'x' | 'instagram' | 'threads'
 * @returns {{service, text, imageUrls, altText}}
 */
export const buildPayload = (post, platform) => {
  const service = SERVICE[platform];
  if (!service) throw new Error(`Unknown platform ${platform}`);

  const media = post.media || [];
  const copy = post.copy || {};
  let text;
  let imageUrls;

  if (platform === 'x') {
    // X has no carousels — send exactly one image (first card targeting X).
    const hero = cardsFor(media, 'x')[0] || media[0];
    text = copy.x;
    imageUrls = hero ? [publicUrl(hero.landscape_path)] : [];
  } else if (platform === 'instagram') {
    const hashtags = (copy.hashtags || []).map((h) => `#${h.replace(/^#/, '')}`).join(' ');
    text = hashtags ? `${copy.instagram}\n\n${hashtags}` : copy.instagram;
    imageUrls = cardsFor(media, 'instagram').map((m) => publicUrl(m.portrait_path));
  } else { // threads — trending uses the full chart image; no article links
    const link = post.post_type === 'trending' ? chartUrl('threads') : null;
    text = link ? `${copy.threads}\n\n${link}` : copy.threads;
    imageUrls = cardsFor(media, 'threads').map((m) => publicUrl(m.landscape_path));
  }

  return { service, text, imageUrls, altText: copy.alt_text || null };
};
