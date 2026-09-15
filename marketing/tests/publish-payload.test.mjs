import test from 'node:test';
import assert from 'node:assert/strict';

// publicUrl() reads this at module load to build storage URLs.
process.env.SUPABASE_URL ??= 'https://example.supabase.co';

const { buildPayload, sendTimeFor, sydneyDay, weekdayKey, SERVICE, SEND_HOUR_SYDNEY } =
  await import('../publish/payload.mjs');

const post = {
  topic_key: 'test',
  post_type: 'hidden_gem',
  scheduled_for: '2026-09-14T23:30:00.000Z',
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

test('the planner schedules at 23:30 UTC, which is already tomorrow in Sydney', () => {
  // The single most repeatable mistake in this pipeline: slicing the UTC string
  // names the day BEFORE the one the post is actually for, on every post.
  assert.equal(post.scheduled_for.slice(0, 10), '2026-09-14');
  assert.equal(sydneyDay(post), '2026-09-15');
});

// A stand-in for what Buffer reports for a channel: the hours it recommends for
// that service, per weekday, in the channel's own timezone.
const igSlots = {
  timezone: 'Australia/Sydney',
  byDay: { tue: ['17:05', '19:37'], wed: ['13:37', '18:34'] },
};

test('the weekday key matches the one Buffer uses', () => {
  assert.equal(weekdayKey('2026-09-15'), 'tue');
  assert.equal(weekdayKey('2026-09-20'), 'sun');
});

test('the time comes from the channel schedule, the day from the post', () => {
  // 15 Sep 2026 is a Tuesday; Instagram's first Tuesday slot is 17:05 Sydney,
  // which is 07:05 UTC in AEST. The DAY is still the post's own.
  const when = sendTimeFor(post, igSlots);
  assert.equal(sydneyDay({ scheduled_for: when.toISOString() }), '2026-09-15');
  assert.equal(when.toISOString(), '2026-09-15T07:05:00.000Z');
});

test('the second post of the day takes the second slot', () => {
  assert.equal(sendTimeFor(post, igSlots, 1).toISOString(), '2026-09-15T09:37:00.000Z');
});

test('more posts than slots are spaced out, never stacked', () => {
  // Two channels firing at the same minute reads as a bot, and Instagram may
  // drop the second outright. The third post goes 45 minutes after the last slot.
  const third = sendTimeFor(post, igSlots, 2);
  const second = sendTimeFor(post, igSlots, 1);
  assert.equal(third.getTime() - second.getTime(), 45 * 60_000);
  assert.equal(sendTimeFor(post, igSlots, 3).getTime() - second.getTime(), 90 * 60_000);
});

test('a channel with no schedule for that weekday falls back to the house hour', () => {
  // 15 Sep is a Tuesday and this schedule only covers Wednesday.
  const sparse = { timezone: 'Australia/Sydney', byDay: { wed: ['13:37'] } };
  assert.equal(sendTimeFor(post, sparse).toISOString(), '2026-09-15T02:00:00.000Z');
  assert.equal(sendTimeFor(post, undefined).toISOString(), '2026-09-15T02:00:00.000Z');
});

test('a post goes out at noon Sydney on its own day', () => {
  // September is AEST (UTC+10), so noon Sydney is 02:00 UTC — which is what the
  // old publish cron ASKED for and never got. GitHub started it ~07:10 UTC every
  // time, so posts really landed ~17:15 Sydney. Buffer honours the time it is
  // given, so this constant now decides the hour rather than describing it.
  assert.equal(sendTimeFor(post).toISOString(), '2026-09-15T02:00:00.000Z');
});

test('a channel slot survives the daylight-saving changeover too', () => {
  // Sydney goes to UTC+11 on 4 October 2026. 5 Oct is a Monday.
  const slots = { timezone: 'Australia/Sydney', byDay: { mon: ['19:06'] } };
  const after = { ...post, scheduled_for: '2026-10-04T23:30:00.000Z' };
  assert.equal(sydneyDay(after), '2026-10-05');
  assert.equal(sendTimeFor(after, slots).toISOString(), '2026-10-05T08:06:00.000Z');
});

test('noon Sydney survives the daylight-saving changeover', () => {
  // Sydney goes to UTC+11 on 4 October 2026. A week generated across that
  // boundary would be an hour out on one side of it if the offset were fixed.
  const after = { ...post, scheduled_for: '2026-10-04T23:30:00.000Z' };
  assert.equal(sydneyDay(after), '2026-10-05');
  assert.equal(sendTimeFor(after).toISOString(), '2026-10-05T01:00:00.000Z');

  // Same wall-clock hour on both sides, which is the property that matters.
  for (const iso of ['2026-09-14T23:30:00.000Z', '2026-10-04T23:30:00.000Z']) {
    const hour = sendTimeFor({ scheduled_for: iso })
      .toLocaleString('en-AU', { timeZone: 'Australia/Sydney', hour: 'numeric', hour12: false });
    assert.equal(Number(hour), SEND_HOUR_SYDNEY, iso);
  }
});

test('X gets one image and the bare copy', () => {
  const p = buildPayload(post, 'x');
  assert.equal(p.service, 'twitter');
  assert.equal(p.text, post.copy.x);
  assert.equal(p.imageUrls.length, 1, 'X has no carousel');
  assert.match(p.imageUrls[0], /a-l\.jpg$/);
  assert.equal(p.altText, 'A poster on a wall');
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
  assert.match(buildPayload(trending, 'threads').text, /https?:\/\//);
  // ...and never on X, where VOICE.md forbids URLs.
  assert.ok(!buildPayload(trending, 'x').text.includes('http'));
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
