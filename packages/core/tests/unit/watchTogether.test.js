import test from 'node:test';
import assert from 'node:assert/strict';
import { tileMode, tileShowsCount, splitWatchTogether, personName, filterByKind, splitGroupMatches, shufflePick, watchTogetherErrorCode } from '../../watchTogether.js';
import { WATCH_TOGETHER } from '../../copy/watchTogether.js';

test('tile mode follows pair state first, then plan and privacy', () => {
  assert.equal(tileMode({ viewerPremium: false, targetPublic: true, state: 'none' }), 'free');
  assert.equal(tileMode({ viewerPremium: true, targetPublic: true, state: 'none' }), 'public');
  assert.equal(tileMode({ viewerPremium: true, targetPublic: false, state: 'none' }), 'private');
  assert.equal(tileMode({ viewerPremium: true, targetPublic: false, state: 'outgoing' }), 'pending');
  assert.equal(tileMode({ viewerPremium: false, targetPublic: false, state: 'incoming' }), 'incoming');
  // A Free person who was invited is still paired.
  assert.equal(tileMode({ viewerPremium: false, targetPublic: false, state: 'paired' }), 'paired');
});

test('counts only show where the server may have sent one', () => {
  assert.equal(tileShowsCount('public', 14), true);
  assert.equal(tileShowsCount('private', 14), false);
  assert.equal(tileShowsCount('pending', 14), false);
  assert.equal(tileShowsCount('paired', null), false);
});

test('rows split into partners, incoming and outgoing', () => {
  const rows = [{ other_id: 'a', direction: 'paired' }, { other_id: 'b', direction: 'incoming' }, { other_id: 'c', direction: 'outgoing' }];
  const split = splitWatchTogether(/** @type {any} */ (rows));
  assert.deepEqual([split.partners, split.incoming, split.outgoing].map(l => l.map(r => r.other_id)), [['a'], ['b'], ['c']]);
  assert.deepEqual(splitWatchTogether(null).partners, []);
});

test('names, kind filter, group split and shuffle', () => {
  assert.equal(personName({ display_name: 'Sam', username: 'sam' }), 'Sam');
  assert.equal(personName({ display_name: null, username: 'sam' }), 'sam');
  const t = (id, media_type, saved) => ({ tmdb_id: id, media_type, title: `T${id}`, poster_path: null, release_date: null, genre_ids: [], provider_ids: [], saved_by: saved });
  const titles = [t(1, 'movie', ['me', 'a', 'b']), t(2, 'tv', ['me', 'a']), t(3, 'movie', ['a', 'b'])];
  assert.deepEqual(filterByKind(titles, 'movie').map(x => x.tmdb_id), [1, 3]);
  assert.deepEqual(filterByKind(titles, 'all').length, 3);
  const { all, some } = splitGroupMatches(titles, 3);
  assert.deepEqual([all.map(x => x.tmdb_id), some.map(x => x.tmdb_id)], [[1], [2, 3]]);
  assert.equal(shufflePick(titles, 1, () => 0).tmdb_id, 2);
  assert.equal(shufflePick([titles[0]], 1, () => 0).tmdb_id, 1);
  assert.equal(shufflePick([], null), null);
});

test('server error codes map to copy keys', () => {
  assert.equal(watchTogetherErrorCode({ message: 'premium_required' }), 'premium_required');
  assert.equal(watchTogetherErrorCode({ message: 'not_allowed' }), 'not_allowed');
  assert.equal(watchTogetherErrorCode({ message: 'boom' }), 'generic');
  for (const code of ['premium_required', 'not_allowed', 'generic']) assert.ok(WATCH_TOGETHER.errors[code]);
});

test('copy avoids em dashes', () => {
  // Copy functions take names, counts or name lists; try each shape.
  const render = (fn) => { try { return String(fn('X', 'Y')); } catch { return String(fn(['X', 'Y'])); } };
  const walk = (v) => typeof v === 'string' ? [v] : typeof v === 'function' ? [render(v)] : Object.values(v).flatMap(walk);
  for (const s of walk(WATCH_TOGETHER)) assert.ok(!s.includes('—'), s);
});

test('session progress walks the deck and lists matches', async () => {
  const { sessionProgress, swipeDecision, sessionChannel } = await import('../../watchTogether.js');
  const card = (id) => ({ tmdb_id: id, media_type: 'movie', title: `T${id}`, poster_path: null, release_date: null });
  const session = { id: 's', other_id: 'o', live: true, deck: [card(1), card(2), card(3)], my_votes: [{ tmdb_id: 1, media_type: 'movie', yes: true }], other_answered: 2, matches: [{ tmdb_id: 1, media_type: 'movie' }] };
  const p = sessionProgress(session);
  assert.equal(p.card.tmdb_id, 2);
  assert.deepEqual([p.index, p.total, p.answered, p.done], [1, 3, 1, false]);
  assert.deepEqual(p.matches.map(c => c.tmdb_id), [1]);
  const done = sessionProgress({ ...session, my_votes: [1, 2, 3].map(id => ({ tmdb_id: id, media_type: 'movie', yes: false })) });
  assert.deepEqual([done.card, done.index, done.done], [null, 3, true]);
  assert.equal(sessionProgress(null).total, 0);
  assert.deepEqual([swipeDecision(150), swipeDecision(-150), swipeDecision(40)], ['yes', 'no', null]);
  assert.equal(sessionChannel('abc'), 'wt-session:abc');
});

test('pickDemoDeck takes up to five saved titles and skips bad rows', async () => {
  const { pickDemoDeck, DEMO_SIZE } = await import('../../watchTogether.js');
  const items = Array.from({ length: 8 }, (_, i) => ({ tmdb_id: i + 1, media_type: 'movie' }));
  const deck = pickDemoDeck([...items, null, { tmdb_id: 0, media_type: 'movie' }], () => 0.3);
  assert.equal(deck.length, DEMO_SIZE);
  assert.ok(deck.every(t => t && t.tmdb_id > 0));
  assert.equal(new Set(deck.map(t => t.tmdb_id)).size, DEMO_SIZE);
  assert.deepEqual(pickDemoDeck(null), []);
});

test('demoPartnerSaysYes always ends the demo on a match', async () => {
  const { demoPartnerSaysYes } = await import('../../watchTogether.js');
  assert.equal(demoPartnerSaysYes({ index: 4, total: 5, matchedSoFar: false, random: () => 0.99 }), true);
  assert.equal(demoPartnerSaysYes({ index: 4, total: 5, matchedSoFar: true, random: () => 0.99 }), false);
  assert.equal(demoPartnerSaysYes({ index: 1, total: 5, matchedSoFar: false, random: () => 0.1 }), true);
});

test('buildWatchTogetherLinkUrl needs a username and a real key', async () => {
  const { buildWatchTogetherLinkUrl } = await import('../../sharing.js');
  assert.equal(buildWatchTogetherLinkUrl({ username: '@jess', key: 'a1b2c3d4e5f6' }), 'https://app.theplot.tv/watch-with/jess/a1b2c3d4e5f6');
  assert.equal(buildWatchTogetherLinkUrl({ username: 'jess', key: '' }), null);
  assert.equal(buildWatchTogetherLinkUrl({ username: '', key: 'a1b2c3d4e5f6' }), null);
  assert.equal(buildWatchTogetherLinkUrl({ username: 'jess', key: '../../x' }), null);
  assert.equal(buildWatchTogetherLinkUrl({ username: 'jess', key: 'a1b2c3d4e5f6', origin: 'https://abc.plot-5wr.pages.dev' }), 'https://abc.plot-5wr.pages.dev/watch-with/jess/a1b2c3d4e5f6');
});

test('unlockedPartners returns only partners that were locked and can decide now', async () => {
  const { unlockedPartners } = await import('../../watchTogether.js');
  const partners = [
    { other_id: 'sam', can_decide: true },
    { other_id: 'priya', can_decide: true },
    { other_id: 'jess', can_decide: false },
  ];
  assert.deepEqual(unlockedPartners(partners, ['sam', 'jess', 'gone']).map(p => p.other_id), ['sam']);
  assert.deepEqual(unlockedPartners(partners, null), []);
});
