import test from 'node:test';
import assert from 'node:assert/strict';
import { tmdb } from '../lib/tmdb.mjs';
import { evaluate } from '../planner/triggers/conversation.mjs';

// supabase: null keeps recentlyUsed() offline (it returns an empty set). The
// out-today tier reads only ctx.tracked; the trending tier is driven through a
// stubbed tmdb client, so nothing here touches the network.
const PUBLISH_AT = new Date('2026-09-11T02:00:00Z');
const TODAY = '2026-09-11';

const ctx = (tracked = []) => ({ supabase: null, publishAt: PUBLISH_AT, weekday: 'Friday', tracked });

const tracked = (over = {}) => ({
  media_type: 'movie',
  tmdb_id: 100,
  title: 'Out Today',
  popularity: 50,
  release_date: '2026-06-01',
  digital_date: TODAY,
  ...over,
});

// Swap the tmdb client's methods for the duration of one test.
const withTmdb = (t, { trending = [], details = {} }) => {
  t.mock.method(tmdb, 'getTrending', async () => trending);
  t.mock.method(tmdb, 'getDetails', async (_type, id) => details[id] || null);
};

// ── Out today ────────────────────────────────────────────────────────────
test('a title out today wins, and the payload names it', async () => {
  const c = await evaluate(ctx([tracked()]));

  assert.equal(c.post_type, 'question');
  assert.equal(c.topic_key, `conversation:${TODAY}`);
  assert.deepEqual(c.tmdb_refs, [{ media_type: 'movie', id: 100, title: 'Out Today' }]);
  assert.equal(c.payload.topic.mode, 'topical');
  assert.equal(c.payload.topic.hook, 'out_today');
  assert.equal(c.payload.title.title, 'Out Today');
});

test('the most popular of several out today is chosen', async () => {
  const c = await evaluate(ctx([
    tracked({ tmdb_id: 100, title: 'Small', popularity: 10 }),
    tracked({ tmdb_id: 200, title: 'Big', popularity: 90 }),
  ]));

  assert.equal(c.tmdb_refs[0].id, 200);
});

test('exclude keeps the question off a title the day already covers', async () => {
  const c = await evaluate(
    ctx([
      tracked({ tmdb_id: 100, title: 'Already Posted', popularity: 90 }),
      tracked({ tmdb_id: 200, title: 'Still Free', popularity: 10 }),
    ]),
    { exclude: new Set([100]) },
  );

  assert.equal(c.tmdb_refs[0].id, 200);
});

// Major-release days deliberately pair the release post with a question about
// that same title, so `subject` has to win outright — including over a title
// the resolver would otherwise prefer.
test('subject forces the title and bypasses resolution', async () => {
  const c = await evaluate(
    ctx([tracked({ tmdb_id: 999, title: 'More Popular', popularity: 500 })]),
    { subject: { media_type: 'tv', id: 42, title: 'The Big Release' } },
  );

  assert.deepEqual(c.tmdb_refs, [{ media_type: 'tv', id: 42, title: 'The Big Release' }]);
  assert.equal(c.payload.topic.hook, 'out_today');
});

// ── Trending, released only ──────────────────────────────────────────────
// The whole point of the slot: never speculate about something unreleased.
test('an unreleased trending title is never the subject', async (t) => {
  withTmdb(t, {
    trending: [
      { media_type: 'movie', id: 1, title: 'Not Out Yet', popularity: 500, release_date: '2026-12-01' },
      { media_type: 'movie', id: 2, title: 'Actually Out', popularity: 100, release_date: '2026-09-05' },
    ],
  });

  const c = await evaluate(ctx());

  assert.equal(c.tmdb_refs[0].id, 2);
  assert.equal(c.payload.topic.hook, 'just_out');
  assert.equal(c.payload.topic.when_label, '5 September');
});

test('a trending title with no release date at all is skipped', async (t) => {
  withTmdb(t, {
    trending: [
      { media_type: 'movie', id: 1, title: 'Undated', popularity: 500 },
      { media_type: 'movie', id: 2, title: 'Dated', popularity: 100, release_date: '2026-09-05' },
    ],
  });

  const c = await evaluate(ctx());
  assert.equal(c.tmdb_refs[0].id, 2);
});

test('a new release beats a more trending back-catalogue title', async (t) => {
  withTmdb(t, {
    trending: [
      { media_type: 'movie', id: 1, title: 'Old Favourite', popularity: 500, release_date: '2019-01-01' },
      { media_type: 'movie', id: 2, title: 'New Release', popularity: 100, release_date: '2026-09-05' },
    ],
  });

  const c = await evaluate(ctx());
  assert.equal(c.tmdb_refs[0].id, 2);
});

test('the widened window is used rather than leaving the slot empty', async (t) => {
  withTmdb(t, {
    // Outside the 14-day window, inside the 30-day one.
    trending: [{ media_type: 'movie', id: 1, title: 'Out Last Month', popularity: 100, release_date: '2026-08-20' }],
  });

  const c = await evaluate(ctx());
  assert.equal(c.tmdb_refs[0].id, 1);
  assert.equal(c.payload.topic.hook, 'just_out');
});

// A returning season is prime conversation material, and judging TV on
// first_air_date alone would throw every one of them away.
test('a show airing now is picked on its latest episode, not its premiere', async (t) => {
  withTmdb(t, {
    trending: [{ media_type: 'tv', id: 7, name: 'Long Runner', popularity: 400, first_air_date: '2019-01-01' }],
    details: { 7: { last_episode_to_air: { air_date: '2026-09-08' } } },
  });

  const c = await evaluate(ctx());

  assert.equal(c.tmdb_refs[0].id, 7);
  assert.equal(c.payload.topic.hook, 'airing');
  assert.equal(c.payload.topic.when_label, '8 September');
});

test('an old show with no recent episode is not treated as current', async (t) => {
  withTmdb(t, {
    trending: [
      { media_type: 'tv', id: 7, name: 'Finished Years Ago', popularity: 400, first_air_date: '2019-01-01' },
      { media_type: 'movie', id: 2, title: 'New Release', popularity: 100, release_date: '2026-09-05' },
    ],
    details: { 7: { last_episode_to_air: { air_date: '2019-06-01' } } },
  });

  const c = await evaluate(ctx());
  assert.equal(c.tmdb_refs[0].id, 2);
});

test('nothing released means no question, not a speculative one', async (t) => {
  withTmdb(t, {
    trending: [{ media_type: 'movie', id: 1, title: 'Not Out Yet', popularity: 500, release_date: '2026-12-01' }],
  });

  assert.equal(await evaluate(ctx()), null);
});

// The windows are deliberately short — being on trend is the whole point of the
// slot, so a title past the widened window loses to nothing at all.
test('a release past the widened window is not on trend enough', async (t) => {
  withTmdb(t, {
    trending: [{ media_type: 'movie', id: 1, title: 'Two Months Old', popularity: 900, release_date: '2026-07-01' }],
  });

  assert.equal(await evaluate(ctx()), null);
});
