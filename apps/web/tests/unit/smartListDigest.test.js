import test from 'node:test';
import assert from 'node:assert/strict';
import {
  cleanRules, discoverQuery, inDigest, pageMatches, listRun, buildDigest, isoWeek, digestDedupeKey, providerIdsOf, rulesTypes,
  SEEN_CAP, PENDING_CAP,
} from '../../../../supabase/functions/_shared/smartListDigest.js';
import { normalizeSmartListRules, smartListInRollUp, smartListPickerOptions } from '@plot/core/smartLists.js';
import { discoverParams, pickerProviderIds } from '@plot/core/tonightPicker.js';

// The weekly smart lists roll-up. The job cannot import @plot/core, so these
// first tests hold its copy of the rules and the discover query to the app's:
// if either side changes alone, a list would find different titles in the
// notification than on its own page.

const RULE_SETS = [
  {},
  { mediaType: 'tv', genreIds: [18, 80], minScore: 7, onlyServices: true },
  { mediaType: 'any', era: 'recent', hideWatched: false },
  { mediaType: 'movie', maxRuntime: 90, era: 'classic', genreIds: [10751] },
  { mediaType: 'tv', maxRuntime: 30, era: '2010s', minScore: 8 },
  { mediaType: 'movie', maxRuntime: 45, minScore: 5, era: 'nope', genreIds: [-53, 'x', 35, 35] },
  { source: 'history', minMyRating: 8, hideWatched: true },
  { source: 'watchlist', mediaType: 'any', maxRuntime: 120 },
];

test('rules are cleaned exactly as the app cleans them', () => {
  for (const raw of RULE_SETS) assert.deepEqual(cleanRules(raw), normalizeSmartListRules(raw), JSON.stringify(raw));
  assert.equal(cleanRules(null), null);
  assert.equal(cleanRules([]), null);
});

test('the discover query is the one the app sends for page 1', () => {
  const now = new Date();
  for (const raw of RULE_SETS) {
    const rules = normalizeSmartListRules(raw);
    for (const hideKids of [true, false]) {
      for (const type of rulesTypes(rules)) {
        const ctx = { providerIds: [8, 337], region: 'AU' };
        const app = discoverParams(smartListPickerOptions(rules, type, { hideKids }), { ...ctx, page: 1 });
        assert.deepEqual(discoverQuery(rules, type, { ...ctx, hideKids, now }), app, `${JSON.stringify(raw)} ${type} hideKids=${hideKids}`);
      }
    }
  }
});

test('services are read the way the app reads them', () => {
  const providers = [{ id: 8 }, { id: '337' }, { id: 'x' }, {}, { id: 8 }];
  assert.deepEqual(providerIdsOf(providers), pickerProviderIds(providers));
  assert.deepEqual(providerIdsOf(null), []);
});

// Opaque fixture ids, never real TMDB lookups.
const result = (id, extra = {}) => ({ id, poster_path: `/p${id}.jpg`, genre_ids: [18], ...extra });

test('a page keeps what the app would show: posters, no kids titles when hidden, nothing watched', () => {
  const rules = cleanRules({ hideWatched: true });
  const watched = new Set(['movie:3']);
  const keys = pageMatches([result(1), result(2, { poster_path: null }), result(3), result(4, { genre_ids: [10751] }), result(1)], 'movie',
    { rules, hideKids: true, watched }).map(m => m.key);
  assert.deepEqual(keys, ['movie:1']);
  // Asking for Family is asking for kids titles.
  const family = cleanRules({ genreIds: [10751] });
  assert.deepEqual(pageMatches([result(4, { genre_ids: [10751] })], 'movie', { rules: family, hideKids: true, watched }).map(m => m.key), ['movie:4']);
});

test('a list never opened is recorded and counts nothing', () => {
  const { newKeys, next } = listRun(['movie:1', 'movie:2'], null);
  assert.deepEqual(newKeys, []);
  assert.deepEqual(next, { seen_keys: ['movie:1', 'movie:2'], pending_keys: [] });
});

test('new means in neither seen nor pending, and a second run finds nothing more', () => {
  const row = { seen_keys: ['movie:1'], pending_keys: ['movie:2'] };
  const first = listRun(['movie:1', 'movie:2', 'movie:3', 'tv:3'], row);
  assert.deepEqual(first.newKeys, ['movie:3', 'tv:3']);
  assert.deepEqual(first.next, { seen_keys: ['movie:1'], pending_keys: ['movie:3', 'tv:3', 'movie:2'] });
  const second = listRun(['movie:1', 'movie:2', 'movie:3', 'tv:3'], { ...row, ...first.next });
  assert.deepEqual(second, { newKeys: [], next: null });
});

test('pending keys stop at their cap', () => {
  const keys = Array.from({ length: PENDING_CAP + 20 }, (_, i) => `movie:${i}`);
  const { next } = listRun(keys, { seen_keys: [], pending_keys: [] });
  assert.equal(next.pending_keys.length, PENDING_CAP);
  assert.equal(listRun(Array.from({ length: SEEN_CAP + 5 }, (_, i) => `tv:${i}`), null).next.seen_keys.length, SEEN_CAP);
});

test('the roll-up is one row: total, lists by most new, three posters; nothing new is nothing sent', () => {
  const digest = buildDigest([
    { id: 'a', name: 'Short thrillers', newKeys: ['movie:1', 'movie:2'], posters: { 'movie:1': '/1.jpg', 'movie:2': '/2.jpg' } },
    { id: 'b', name: 'Nothing new', newKeys: [], posters: {} },
    { id: 'c', name: 'New films worth it', newKeys: ['movie:3', 'movie:4', 'movie:5'], posters: { 'movie:3': '/3.jpg', 'movie:4': '/4.jpg', 'movie:5': '/5.jpg' } },
  ]);
  assert.deepEqual(digest, {
    count: 5,
    lists: [{ id: 'c', name: 'New films worth it', count: 3 }, { id: 'a', name: 'Short thrillers', count: 2 }],
    posters: ['/3.jpg', '/4.jpg', '/5.jpg'],
  });
  assert.equal(buildDigest([{ id: 'b', name: 'x', newKeys: [], posters: {} }]), null);
});

test('one roll-up per ISO week: the dedupe key is the week', () => {
  assert.equal(isoWeek(new Date('2026-10-04T21:00:00Z')), '2026-W40');
  assert.equal(isoWeek(new Date('2026-09-28T00:00:00Z')), '2026-W40');
  assert.equal(isoWeek(new Date('2027-01-01T12:00:00Z')), '2026-W53');
  assert.equal(digestDedupeKey('2026-W40'), 'smart_list_digest:2026-W40');
});

test('the job skips exactly the lists the app shows as out of the roll-up', () => {
  for (const raw of [...RULE_SETS, null, []]) {
    for (const digest_enabled of [undefined, null, true, false]) {
      const list = { rules: raw, digest_enabled };
      assert.equal(inDigest(list), smartListInRollUp(list), `${JSON.stringify(raw)} digest_enabled=${digest_enabled}`);
    }
  }
  assert.equal(inDigest({ rules: { source: 'discover' }, digest_enabled: false }), false);
  assert.equal(inDigest({ rules: { source: 'discover' }, digest_enabled: true }), true);
});

test('someone with every list switched off is sent nothing', () => {
  const lists = [
    { id: 'a', rules: { source: 'discover' }, digest_enabled: false },
    { id: 'b', rules: { source: 'discover', mediaType: 'tv' }, digest_enabled: false },
    { id: 'c', rules: { source: 'watchlist' }, digest_enabled: true },
  ];
  const included = lists.filter(inDigest);
  assert.deepEqual(included, []);
  assert.equal(buildDigest(included.map(l => ({ id: l.id, name: l.id, newKeys: ['movie:1'], posters: {} }))), null);
});
