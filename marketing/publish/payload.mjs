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
import { DEFAULT_PUBLISH_TIME, PUBLISH_TZ, zonedInstant } from '../lib/dates.mjs';

/** Our platform name -> Buffer's service name. */
export const SERVICE = { x: 'twitter', instagram: 'instagram', threads: 'threads' };
const UTM_SOURCE_BY_SERVICE = { twitter: 'x', instagram: 'instagram', threads: 'threads' };

/**
 * The hour, in Eastern Time, that a post goes out when a channel has no
 * posting schedule for that weekday.
 *
 * The real times come from each channel's own posting schedule in Buffer
 * (see sendTimeFor). Those hours are applied on the post's Eastern Time day.
 * This fallback matches the planner's 9:00am Eastern default.
 */
export const SEND_HOUR_ET = DEFAULT_PUBLISH_TIME.hour;

// Cards can be limited to specific platforms (media[i].channels); null = all.
const cardsFor = (media, channel) => media.filter((m) => !m.channels || m.channels.includes(channel));

/**
 * The Eastern Time calendar day a post belongs to.
 *
 * NOT `scheduled_for.slice(0, 10)`. An evening Eastern instant is already the
 * next UTC date, so slicing the UTC string names the day after the one the
 * post is for. This matches dueDateFor() in
 * supabase/functions/_shared/linearIssue.js, so the card and the Buffer post
 * agree about what day it is.
 */
export const publishDay = (post) =>
  new Date(post.scheduled_for).toLocaleDateString('en-CA', { timeZone: PUBLISH_TZ });

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
 * The DAY is ours: it comes from the post's Eastern Time schedule, and the
 * copy is written against it. The clock time is the channel's posting
 * schedule, applied as Eastern Time on that day. The nth post for a channel
 * on a day takes the nth slot.
 *
 * @param {object} post     a marketing_posts row
 * @param {object} [slots]  that channel's schedule: {byDay}
 * @param {number} [index]  how many posts this channel already has that day
 * @returns {Date}
 */
export const sendTimeFor = (post, slots, index = 0) => {
  const day = publishDay(post);
  const times = slots?.byDay?.[weekdayKey(day)] ?? [];

  // No schedule for this channel or this weekday — fall back to 9:00am Eastern.
  if (!times.length) return zonedInstant(day, SEND_HOUR_ET, 0, PUBLISH_TZ);

  if (index < times.length) {
    const [hh, mm] = times[index].split(':').map(Number);
    return zonedInstant(day, hh, mm, PUBLISH_TZ);
  }

  const [hh, mm] = times[times.length - 1].split(':').map(Number);
  const overflow = (index - times.length + 1) * OVERFLOW_GAP_MINUTES;
  return new Date(zonedInstant(day, hh, mm, PUBLISH_TZ).getTime() + overflow * 60_000);
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
    // X has no carousels but takes up to four images on one post; send every
    // card targeting X (the trending chart is two five-row images).
    const xCards = cardsFor(media, 'x');
    const chosen = (xCards.length ? xCards : media.slice(0, 1)).slice(0, 4);
    text = copy.x;
    imageUrls = chosen.map((m) => publicUrl(m.landscape_path));
  } else if (platform === 'instagram') {
    const hashtags = (copy.hashtags || []).map((h) => `#${h.replace(/^#/, '')}`).join(' ');
    text = hashtags ? `${copy.instagram}\n\n${hashtags}` : copy.instagram;
    imageUrls = cardsFor(media, 'instagram').map((m) => publicUrl(m.portrait_path));
  } else { // threads — trending uses the full chart image; no article links
    const link = post.post_type === 'trending'
      ? chartUrl({ source: UTM_SOURCE_BY_SERVICE[service], campaign: post.post_type, content: post.id })
      : null;
    text = link ? `${copy.threads}\n\n${link}` : copy.threads;
    imageUrls = cardsFor(media, 'threads').map((m) => publicUrl(m.landscape_path));
  }

  return { service, text, imageUrls, altText: copy.alt_text || null };
};
