import test from 'node:test';
import assert from 'node:assert/strict';

// publicUrl() reads this at module load to build storage URLs.
process.env.SUPABASE_URL ??= 'https://example.supabase.co';

const { buildPayload, sendTimeFor, publishDay, weekdayKey, SERVICE, SEND_HOUR_ET } =
  await import('../publish/payload.mjs');
const { entryUrl, chartUrl } = await import('../lib/feed.mjs');

const post = {
  id: 'post-123',
  topic_key: 'test',
  post_type: 'hidden_gem',
  // Tuesday, September 15, 2026, 9:00am Eastern.
  scheduled_for: '2026-09-15T13:00:00.000Z',
  copy: {
    x: 'A quiet one nobody talks about.',
    instagram: 'A quiet one nobody talks about.',
    threads: 'A quiet one nobody talks about.',
    hashtags: ['a24', 'folkhorror'],
    alt_text: 'A poster on a wall',
  },
  media: [
    { landscape_path: 'cards/a-l.jpg', portrait_path: 'cards/a-p.jpg' },
    { landscape_path: 'cards/b-l.jpg', portrait_path: 'cards/b-p.jpg' },
  ],
};

test('an evening Eastern instant is already the next UTC date', () => {
  // 11:30pm Eastern on September 15 is 03:30 UTC on September 16. Slicing the
  // UTC string names the day after the one the post is for.
  const evening = { scheduled_for: '2026-09-16T03:30:00.000Z' };
  assert.equal(evening.scheduled_for.slice(0, 10), '2026-09-16');
  assert.equal(publishDay(evening), '2026-09-15');
});

// A stand-in for what Buffer reports for a channel: the hours it recommends
// for that service, per weekday. Applied as Eastern Time.
const igSlots = {
  byDay: { tue: ['17:05', '19:37'], wed: ['13:37', '18:34'] },
};

test('the weekday key matches the one Buffer uses', () => {
  assert.equal(weekdayKey('2026-09-15'), 'tue');
  assert.equal(weekdayKey('2026-09-20'), 'sun');
});

test('the time comes from the channel schedule, the day from the post', () => {
  // September 15, 2026 is a Tuesday. The first Tuesday slot is 5:05pm Eastern,
  // which is 21:05 UTC during daylight time. The day is still the post's own.
  const when = sendTimeFor(post, igSlots);
  assert.equal(publishDay({ scheduled_for: when.toISOString() }), '2026-09-15');
  assert.equal(when.toISOString(), '2026-09-15T21:05:00.000Z');
});

test('the second post of the day takes the second slot', () => {
  assert.equal(sendTimeFor(post, igSlots, 1).toISOString(), '2026-09-15T23:37:00.000Z');
});

test('more posts than slots are spaced out, never stacked', () => {
  // Two channels firing at the same minute reads as a bot, and Instagram may
  // drop the second outright. The third post goes 45 minutes after the last slot.
  const third = sendTimeFor(post, igSlots, 2);
  const second = sendTimeFor(post, igSlots, 1);
  assert.equal(third.getTime() - second.getTime(), 45 * 60_000);
  assert.equal(sendTimeFor(post, igSlots, 3).getTime() - second.getTime(), 90 * 60_000);
});

test('a channel with no schedule for that weekday falls back to 9:00am Eastern', () => {
  // September 15 is a Tuesday and this schedule only covers Wednesday.
  const sparse = { byDay: { wed: ['13:37'] } };
  assert.equal(sendTimeFor(post, sparse).toISOString(), '2026-09-15T13:00:00.000Z');
  assert.equal(sendTimeFor(post, undefined).toISOString(), '2026-09-15T13:00:00.000Z');
  assert.equal(SEND_HOUR_ET, 9);
});

test('a post with no channel schedule goes out at 9:00am Eastern on its own day', () => {
  assert.equal(sendTimeFor(post).toISOString(), '2026-09-15T13:00:00.000Z');
  assert.equal(publishDay(post), '2026-09-15');
});

test('a channel slot keeps the same Eastern hour across the daylight-time change', () => {
  const slots = { byDay: { mon: ['19:06'] } };
  // October 26, 2026 is a Monday during daylight time. 7:06pm Eastern is 23:06 UTC.
  const before = { ...post, scheduled_for: '2026-10-26T13:00:00.000Z' };
  assert.equal(publishDay(before), '2026-10-26');
  assert.equal(sendTimeFor(before, slots).toISOString(), '2026-10-26T23:06:00.000Z');
  // November 2, 2026 is the Monday after standard time returns. 7:06pm Eastern is 00:06 UTC Tuesday.
  const after = { ...post, scheduled_for: '2026-11-02T14:00:00.000Z' };
  assert.equal(publishDay(after), '2026-11-02');
  assert.equal(sendTimeFor(after, slots).toISOString(), '2026-11-03T00:06:00.000Z');
});

test('9:00am Eastern stays 9:00am on both sides of the daylight-time change', () => {
  const before = { scheduled_for: '2026-10-26T13:00:00.000Z' };
  const after = { scheduled_for: '2026-11-02T14:00:00.000Z' };
  assert.equal(sendTimeFor(before).toISOString(), '2026-10-26T13:00:00.000Z');
  assert.equal(sendTimeFor(after).toISOString(), '2026-11-02T14:00:00.000Z');

  for (const iso of [before.scheduled_for, after.scheduled_for]) {
    const hour = sendTimeFor({ scheduled_for: iso })
      .toLocaleString('en-US', { timeZone: 'America/New_York', hour: 'numeric', hour12: false });
    assert.equal(Number(hour), SEND_HOUR_ET, iso);
  }
});

test('X gets every landscape image targeting it (max four) and the bare copy', () => {
  const p = buildPayload(post, 'x');
  assert.equal(p.service, 'twitter');
  assert.equal(p.text, post.copy.x);
  assert.equal(p.imageUrls.length, post.media.length, 'one X post carries all its cards');
  assert.ok(p.imageUrls.every((u) => u.endsWith('-l.jpg')), 'landscape crops');
  assert.match(p.imageUrls[0], /a-l\.jpg$/);
  assert.equal(p.altText, 'A poster on a wall');

  const six = { ...post, media: Array.from({ length: 6 }, (_, i) => ({ ...post.media[0], landscape_path: `m${i}-l.jpg` })) };
  assert.equal(buildPayload(six, 'x').imageUrls.length, 4, 'X caps at four images');
});

test('Instagram gets the carousel, portrait, with hashtags appended', () => {
  const p = buildPayload(post, 'instagram');
  assert.equal(p.service, 'instagram');
  assert.match(p.text, /#a24 #folkhorror$/);
  assert.equal(p.imageUrls.length, 2);
  assert.ok(p.imageUrls.every((u) => u.endsWith('-p.jpg')), 'portrait crops');
});

test('Threads gets landscape cards and no hashtag block', () => {
  const p = buildPayload(post, 'threads');
  assert.equal(p.service, 'threads');
  assert.equal(p.text, post.copy.threads);
  assert.ok(!p.text.includes('#'));
  assert.ok(p.imageUrls.every((u) => u.endsWith('-l.jpg')));
});

test('a card limited to one channel is not sent to the others', () => {
  const targeted = {
    ...post,
    media: [{ landscape_path: 'x-only-l.jpg', portrait_path: 'x-only-p.jpg', channels: ['x'] }],
  };
  assert.equal(buildPayload(targeted, 'threads').imageUrls.length, 0);
  assert.equal(buildPayload(targeted, 'x').imageUrls.length, 1);
});

test('a trending post carries the chart link on Threads', () => {
  const trending = { ...post, post_type: 'trending' };
  const text = buildPayload(trending, 'threads').text;
  const link = new URL(text.split('\n\n').at(-1));
  assert.equal(link.pathname, '/whats-on/chart');
  assert.deepEqual(Object.fromEntries(link.searchParams), {
    utm_source: 'threads',
    utm_medium: 'social',
    utm_campaign: 'trending',
    utm_content: post.id,
  });
  // ...and never on X, where VOICE.md forbids URLs.
  assert.ok(!buildPayload(trending, 'x').text.includes('http'));
  assert.ok(!buildPayload(trending, 'instagram').text.includes('http'));
});

test('both feed URLs use four encoded parameters for object tracking', () => {
  const tracking = { source: 'x', campaign: 'trailer_drop', content: 'post 123&456' };
  for (const url of [entryUrl('example-title', tracking), chartUrl(tracking)]) {
    assert.deepEqual(Object.fromEntries(new URL(url).searchParams), {
      utm_source: 'x',
      utm_medium: 'social',
      utm_campaign: 'trailer_drop',
      utm_content: 'post 123&456',
    });
  }
  assert.equal(new URL(entryUrl('example-title', tracking)).pathname, '/whats-on/example-title');
  assert.equal(new URL(chartUrl(tracking)).pathname, '/whats-on/chart');
});

test('legacy string tracking keeps organic_social, and omitted tracking stays bare', () => {
  assert.equal(entryUrl('example-title', 'x'),
    'https://theplot.tv/whats-on/example-title?utm_source=x&utm_medium=organic_social');
  assert.equal(chartUrl('threads'),
    'https://theplot.tv/whats-on/chart?utm_source=threads&utm_medium=organic_social');
  assert.equal(entryUrl('example-title'), 'https://theplot.tv/whats-on/example-title');
  assert.equal(chartUrl(), 'https://theplot.tv/whats-on/chart');
});

test('object tracking requires the post source, type, and ID', () => {
  assert.throws(() => entryUrl('example-title', { source: 'x', campaign: 'trending' }),
    /source, campaign, and content/);
  assert.throws(() => chartUrl({ source: 'threads', content: 'post-123' }),
    /source, campaign, and content/);
});

test('every platform maps to a Buffer service', () => {
  assert.deepEqual(Object.keys(SERVICE).sort(), ['instagram', 'threads', 'x']);
  for (const platform of Object.keys(SERVICE)) {
    assert.equal(buildPayload(post, platform).service, SERVICE[platform]);
  }
});

test('an unknown platform throws rather than composing something wrong', () => {
  assert.throws(() => buildPayload(post, 'bluesky'), /Unknown platform/);
});
