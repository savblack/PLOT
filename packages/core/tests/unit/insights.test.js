import assert from 'node:assert/strict';
import test from 'node:test';

import {
  INSIGHT_PERIODS, FREE_PERIODS, periodEntries, samePeriodLastYear, yearOverYear,
  latelyFacts, latelyShifts, highestRated, onThisDay, weekdayCounts,
  hotTakes, insightsOpenedProps, watchingType, typeHistory, SAMPLE_INSIGHTS, WATCHING_TYPES,
} from '../../insights.js';
import { detailsKey } from '../../historyStats.js';
import { INSIGHTS_VIEW } from '../../copy/insightsView.js';

// Synthetic rows, same shape as historyStats.test.js. The ids never reach TMDB.
let nextId = 1;
const row = (watched_at, extra = {}) => ({
  id: nextId++, tmdb_id: nextId * 10, media_type: 'movie', title: `Title ${nextId}`,
  watched_at, rating: null, note: null, dnf: false, genre_ids: [], created_at: watched_at, ...extra,
});
const GENRES = { 35: 'Comedy', 18: 'Drama', 27: 'Horror' };
const genreName = (id) => GENRES[id] ?? null;
// Local noon, so the calendar day never depends on the machine's timezone.
const at = (y, m, d) => new Date(y, m - 1, d, 12);

test('Free gets This month and This year; All time is Premium', () => {
  assert.deepEqual([...FREE_PERIODS], ['month', 'year']);
  assert.equal(FREE_PERIODS.includes(INSIGHT_PERIODS.ALL), false);
});

test('periodEntries covers the period up to today, never the future', () => {
  const now = at(2026, 11, 21);
  const es = [row('2026-11-01'), row('2026-11-21'), row('2026-11-22'), row('2026-03-01'), row('2025-12-31'), row(null)];
  assert.equal(periodEntries(es, 'month', now).length, 2);
  assert.equal(periodEntries(es, 'year', now).length, 3);
  assert.equal(periodEntries(es, 'all', now).length, 4);
});

test('samePeriodLastYear stops at last year\'s today, and is null for All time', () => {
  const now = at(2026, 11, 21);
  const es = [row('2025-01-05'), row('2025-11-21'), row('2025-11-22'), row('2025-12-25'), row('2024-11-10')];
  assert.equal(samePeriodLastYear(es, 'year', now).length, 2);
  assert.equal(samePeriodLastYear(es, 'month', now).length, 1);
  assert.equal(samePeriodLastYear(es, 'all', now), null);
});

test('yearOverYear: differences, and null with nothing last year', () => {
  const cur = [row('2026-01-01', { rating: 8 }), row('2026-02-01', { rating: 6 }), row('2026-02-02')];
  const prev = [row('2025-01-01', { rating: 10 })];
  assert.deepEqual(yearOverYear(cur, prev), { titles: 2, stars: -1.5 });
  assert.equal(yearOverYear(cur, []), null);
  assert.deepEqual(yearOverYear(cur, [row('2025-01-01')]), { titles: 2, stars: null });
});

test('latelyFacts reads genre, days and mix', () => {
  const now = at(2026, 11, 21);
  const es = [
    row('2026-11-21', { genre_ids: [35], media_type: 'tv' }),
    row('2026-11-20', { genre_ids: [35], media_type: 'tv' }),
    row('2026-11-15', { genre_ids: [35, 18], media_type: 'tv' }),
    row('2026-11-14', { genre_ids: [35] }),
  ];
  const f = latelyFacts(es, { now, genreName });
  assert.equal(f.genre.name, 'Comedy');
  assert.equal(f.showShare, 0.75);
  assert.equal(f.weekendShare, 1);
});

test('latelyFacts says nothing below the minimum', () => {
  const now = at(2026, 11, 21);
  assert.equal(latelyFacts([row('2026-11-20'), row('2026-11-19')], { now, genreName }), null);
  // Older than 30 days doesn't count.
  assert.equal(latelyFacts([row('2026-11-20'), row('2026-11-19'), row('2026-10-01')], { now, genreName }), null);
});

test('latelyShifts: lines only for real changes, null without a usual', () => {
  const now = at(2026, 11, 21);
  const usual = [];
  // A year of mostly drama movies, one a fortnight-ish.
  for (let i = 0; i < 20; i++) {
    const d = new Date(2026, 9, 1 - i * 15, 12);
    usual.push(row(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`, { genre_ids: [18] }));
  }
  const recent = [];
  for (let i = 0; i < 8; i++) recent.push(row(`2026-11-${String(10 + i).padStart(2, '0')}`, { genre_ids: [35], media_type: 'tv' }));
  const lines = latelyShifts([...usual, ...recent], { now, genreName });
  assert.deepEqual(lines.slice(0, 3), ['More comedy than usual', 'Less drama than usual', 'More shows than usual']);
  assert.match(lines[3], /^Watching more than usual: /);
  assert.equal(latelyShifts(recent, { now, genreName }), null);
});

test('highestRated ranks by rating, keeps the first to get there on ties, and collapses rewatches', () => {
  const now = at(2026, 11, 21);
  const a = row('2026-02-01', { rating: 10, title: 'A' });
  const b = row('2026-03-01', { rating: 10, title: 'B' });
  const aAgain = { ...row('2026-11-01', { rating: 6 }), tmdb_id: a.tmdb_id, title: 'A' };
  const c = row('2026-04-01', { rating: 8, title: 'C' });
  const { items } = highestRated([b, aAgain, c, a], { now, periodStart: '2026-01-01' });
  assert.deepEqual(items.map(i => i.entry.title), ['A', 'B', 'C']);
  assert.equal(items[0].entry.rating, 10);
});

test('highestRated movement against 30 days ago', () => {
  const now = at(2026, 11, 21);
  const old1 = row('2026-03-01', { rating: 8, title: 'Old one' });
  const old2 = row('2026-04-01', { rating: 6, title: 'Old two' });
  const fresh = row('2026-11-10', { rating: 10, title: 'Fresh' });
  const r = highestRated([old1, old2, fresh], { now, periodStart: '2026-01-01' });
  assert.equal(r.moves, true);
  assert.deepEqual(r.items.map(i => [i.entry.title, i.move, i.by]), [['Fresh', 'new', 0], ['Old one', 'down', 1], ['Old two', 'down', 1]]);
  // This month is too young for "30 days ago".
  const m = highestRated([fresh], { now, periodStart: '2026-11-01' });
  assert.equal(m.moves, false);
  assert.equal(m.items[0].move, null);
  assert.deepEqual(highestRated([row('2026-11-01')], { now }).items, []);
});

test('onThisDay: earlier years only, newest first', () => {
  const now = at(2026, 11, 21);
  const es = [row('2025-11-21'), row('2023-11-21'), row('2023-11-21'), row('2026-11-21'), row('2025-11-20')];
  const r = onThisDay(es, now);
  assert.deepEqual(r.map(g => [g.year, g.yearsAgo, g.entries.length]), [[2025, 1, 1], [2023, 3, 2]]);
  assert.deepEqual(onThisDay([], now), []);
});

test('onThisDay: Feb 29 comes round on Feb 28 of a common year', () => {
  const es = [row('2024-02-29'), row('2025-02-28')];
  assert.deepEqual(onThisDay(es, at(2026, 2, 28)).map(g => g.year), [2025, 2024]);
  // In a leap year Feb 28 is just Feb 28.
  assert.deepEqual(onThisDay(es, at(2028, 2, 28)).map(g => g.year), [2025]);
});

test('weekdayCounts is Sunday first and skips undated rows', () => {
  assert.deepEqual(weekdayCounts([row('2026-11-22'), row('2026-11-21'), row('2026-11-21'), row(null)]), [1, 0, 0, 0, 0, 0, 2]);
});

test('hotTakes: a star or more from the crowd, furthest first', () => {
  const es = [row('2026-01-01', { rating: 4 }), row('2026-01-02', { rating: 10 }), row('2026-01-03', { rating: 7 }), row('2026-01-04')];
  const details = new Map([
    [detailsKey(es[0]), { vote_average: 8.4 }], // -2.2 stars
    [detailsKey(es[1]), { vote_average: 7.6 }], // +1.2
    [detailsKey(es[2]), { vote_average: 7.0 }], // 0
  ]);
  const r = hotTakes(es, details);
  assert.deepEqual(r.map(t => t.entry.id), [es[0].id, es[1].id]);
  assert.equal(r[0].crowdStars, 4.2);
});

test('insightsOpenedProps has one shape on both apps', () => {
  assert.deepEqual(insightsOpenedProps({ premium: 1, source: 'mobile' }), { premium: true, source: 'mobile' });
});

test('watchingType: null below five titles, then the strongest rule wins', () => {
  const now = at(2026, 11, 21);
  assert.equal(watchingType([row('2026-11-20'), row('2026-11-19')], { now, genreName }), null);
  // Six horror titles out of seven in the last 30 days: a devotee, named for the genre.
  const es = [
    ...['2026-11-21', '2026-11-20', '2026-11-14', '2026-11-13', '2026-11-07', '2026-11-06'].map(d => row(d, { genre_ids: [27] })),
    row('2026-11-01', { genre_ids: [35] }),
  ];
  const t = watchingType(es, { now, genreName });
  assert.equal(t.id, 'devotee');
  assert.equal(t.name, 'The Horror Devotee');
  assert.equal(t.basis, 'lately');
  assert.equal(t.reasons[0], 'Horror in 86% of what you watched');
  assert.ok(t.reasons.length >= 1 && t.reasons.length <= 3);
});

test('watchingType: a binger watches mostly shows, three or more a week', () => {
  const now = at(2026, 11, 21);
  const es = Array.from({ length: 14 }, (_, i) => row(`2026-11-${String(8 + i).padStart(2, '0')}`, { media_type: 'tv', genre_ids: [i % 2 ? 18 : 35] }));
  assert.equal(watchingType(es, { now, genreName }).id, 'binger');
});

test('watchingType: a tough critic, from TMDB scores', () => {
  const now = at(2026, 11, 21);
  const es = ['2026-11-02', '2026-11-05', '2026-11-09', '2026-11-12', '2026-11-17'].map((d, i) => row(d, { rating: 4, genre_ids: [i % 2 ? 18 : 35, 27 + i] }));
  const details = new Map(es.map(e => [detailsKey(e), { vote_average: 8 }]));
  const t = watchingType(es, { now, genreName, details });
  assert.equal(t.id, 'critic');
  assert.equal(t.reasons[0], '2 stars tougher than the crowd');
});

test('watchingType falls back to the year, and to The All-Rounder', () => {
  const now = at(2026, 11, 21);
  const es = ['2026-02-02', '2026-03-03', '2026-04-08', '2026-05-12', '2026-06-16'].map((d, i) => row(d, { media_type: i % 2 ? 'tv' : 'movie', genre_ids: [[35, 18, 27, 53, 80][i]] }));
  const t = watchingType(es, { now, genreName });
  assert.equal(t.basis, 'year');
  assert.equal(t.id, 'allRounder');
});

test('typeHistory: one row per month, newest first, null when thin', () => {
  const now = at(2026, 11, 21);
  const es = Array.from({ length: 6 }, (_, i) => row(`2026-10-0${i + 1}`, { genre_ids: [27] }));
  const h = typeHistory(es, { now, genreName, months: 3 });
  assert.deepEqual(h.map(m => [m.month, m.name]), [[10, null], [9, 'The Horror Devotee'], [8, null]]);
});

test('every type has a name and a line, and the sample is a real type', () => {
  for (const id of WATCHING_TYPES) {
    assert.match(INSIGHTS_VIEW.typeName(id, 'Horror'), /^The /);
    assert.ok(INSIGHTS_VIEW.typeLine[id], `no line for ${id}`);
  }
  assert.ok(WATCHING_TYPES.includes(SAMPLE_INSIGHTS.type.id));
});
