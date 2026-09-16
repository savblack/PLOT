import assert from 'node:assert/strict';
import test from 'node:test';

import {
  calendarParts, entriesInYear, yearsWithEntries, filterEntries, genreCounts,
  titlePerDay, streaks, favouriteWeekday, movieMinutes, formatDuration,
  averageStars, crowdComparison, crowdSentence, recurringPeople, monthInsight,
  yearSentence, detailsKey,
} from '../../historyStats.js';

let nextId = 1;
const row = (watched_at, extra = {}) => ({
  id: nextId++, tmdb_id: nextId * 10, media_type: 'movie', title: `Title ${nextId}`,
  watched_at, rating: null, note: null, dnf: false, genre_ids: [], created_at: watched_at, ...extra,
});
const withDetails = (entries, fn) => new Map(entries.map(e => [detailsKey(e), fn(e)]));

test('calendarParts reads the string, never a Date in local time', () => {
  assert.deepEqual(calendarParts('2026-01-01'), { year: 2026, month: 0, day: 1, weekday: 4 });
  assert.equal(calendarParts(null), null);
  assert.equal(calendarParts('nope'), null);
});

test('entriesInYear and yearsWithEntries', () => {
  const es = [row('2026-03-01'), row('2025-12-31'), row('2026-09-14'), row(null)];
  assert.equal(entriesInYear(es, 2026).length, 2);
  assert.deepEqual(yearsWithEntries(es), [2026, 2025]);
});

test('filterEntries: types and genres narrow, reviewed/dnf are OR-ed, query matches title', () => {
  const a = row('2026-01-01', { media_type: 'tv', genre_ids: [18], note: 'great', title: 'Severance' });
  const b = row('2026-01-02', { media_type: 'movie', genre_ids: [27], dnf: true, title: 'Weapons' });
  const c = row('2026-01-03', { media_type: 'movie', genre_ids: [18, 27], title: 'Anora' });
  const es = [a, b, c];
  assert.deepEqual(filterEntries(es, { types: ['tv'] }), [a]);
  assert.deepEqual(filterEntries(es, { genres: [27] }), [b, c]);
  assert.deepEqual(filterEntries(es, { reviewed: true }), [a]);
  assert.deepEqual(filterEntries(es, { dnf: true }), [b]);
  assert.deepEqual(filterEntries(es, { reviewed: true, dnf: true }), [a, b]);
  assert.deepEqual(filterEntries(es, { query: 'ano' }), [c]);
  assert.deepEqual(filterEntries(es), es);
});

test('genreCounts is most-common first', () => {
  const es = [row('2026-01-01', { genre_ids: [18, 27] }), row('2026-01-02', { genre_ids: [18] })];
  assert.deepEqual(genreCounts(es), [{ id: 18, count: 2 }, { id: 27, count: 1 }]);
});

test('titlePerDay keeps the highest-rated title on a day, else the latest logged', () => {
  const low = row('2026-09-14', { rating: 6, created_at: '2026-09-14T10:00' });
  const high = row('2026-09-14', { rating: 9, created_at: '2026-09-14T09:00' });
  const other = row('2026-09-10', { created_at: '2026-09-10T09:00' });
  const later = row('2026-09-10', { created_at: '2026-09-10T11:00' });
  const notThisMonth = row('2026-08-14', { rating: 10 });
  const m = titlePerDay([low, high, other, later, notThisMonth], 2026, 8);
  assert.equal(m.get(14), high);
  assert.equal(m.get(10), later);
  assert.equal(m.size, 2);
});

test('streaks: best run, current run survives until a day is missed', () => {
  const es = ['2026-08-01', '2026-08-02', '2026-08-03', '2026-08-03', '2026-08-10', '2026-09-15', '2026-09-16']
    .map(d => row(d));
  const s = streaks(es, new Date(2026, 8, 16));
  assert.equal(s.best, 3);
  assert.equal(s.bestMonth, 'August');
  assert.equal(s.current, 2);
  assert.equal(s.watchDays, 6);
  assert.equal(streaks(es, new Date(2026, 8, 17)).current, 2);
  assert.equal(streaks(es, new Date(2026, 8, 18)).current, 0);
  assert.deepEqual(streaks([]), { best: 0, bestMonth: null, current: 0, watchDays: 0 });
});

test('favouriteWeekday', () => {
  const es = ['2026-09-06', '2026-09-13', '2026-09-14'].map(d => row(d)); // Sun, Sun, Mon
  assert.deepEqual(favouriteWeekday(es), { name: 'Sunday', count: 2, total: 3 });
  assert.equal(favouriteWeekday([]), null);
});

test('movieMinutes counts films with a runtime only; formatDuration', () => {
  const es = [row('2026-01-01'), row('2026-01-02', { media_type: 'tv' }), row('2026-01-03')];
  const d = withDetails(es, e => ({ runtime: e.media_type === 'tv' ? 45 : 120 }));
  assert.deepEqual(movieMinutes(es, d), { minutes: 240, counted: 2 });
  assert.equal(formatDuration(0), '0m');
  assert.equal(formatDuration(45), '45m');
  assert.equal(formatDuration(372), '6h 12m');
  assert.equal(formatDuration(1440 * 4 + 360), '4d 6h');
});

test('averageStars converts the 0-10 store to stars', () => {
  assert.deepEqual(averageStars([row('2026-01-01', { rating: 8 }), row('2026-01-02', { rating: 10 }), row('2026-01-03')]), { stars: 4.5, count: 2 });
  assert.equal(averageStars([]), null);
});

test('crowdComparison and crowdSentence', () => {
  const kind = row('2026-01-01', { rating: 9, title: 'Perfect Days' });
  const same = row('2026-01-02', { rating: 8 });
  const harsh = row('2026-01-03', { rating: 2, title: 'Emilia Pérez' });
  const unrated = row('2026-01-04');
  const d = withDetails([kind, same, harsh, unrated], e => ({ vote_average: e === kind ? 7.8 : e === harsh ? 6.4 : 8 }));
  const cmp = crowdComparison([kind, same, harsh, unrated], d);
  assert.equal(cmp.compared, 3);
  assert.equal(cmp.disagreements[0].entry, harsh);
  assert.match(crowdSentence(cmp), /harsher than the crowd, except about Emilia Pérez\.$/);
  assert.equal(crowdSentence(crowdComparison([same], d)), 'In step with the crowd.');
  assert.equal(crowdComparison([unrated], d), null);
});

test('recurringPeople needs more than one title and writes a line', () => {
  const a = row('2026-01-01', { rating: 10 }), b = row('2026-01-02', { rating: 10 }), c = row('2026-01-03', { rating: 6 });
  const scott = { id: 1, name: 'Adam Scott', profile_path: '/s.jpg' };
  const solo = { id: 2, name: 'Only Once', profile_path: null };
  const d = new Map([
    [detailsKey(a), { vote_average: 8, credits: { cast: [scott, solo] } }],
    [detailsKey(b), { vote_average: 8, credits: { cast: [scott] } }],
    [detailsKey(c), { vote_average: 8, credits: { cast: [] } }],
  ]);
  const people = recurringPeople([a, b, c], d);
  assert.equal(people.length, 1);
  assert.equal(people[0].name, 'Adam Scott');
  assert.equal(people[0].count, 2);
  assert.equal(people[0].line, '2 titles this year, all five stars');
});

test('monthInsight picks the strongest true thing', () => {
  const aug = { year: 2026, month: 7, entries: ['01', '02', '03', '04', '05', '09', '12'].map(d => row(`2026-08-${d}`, { rating: 8 })) };
  const sep = { year: 2026, month: 8, entries: ['06', '07', '10'].map(d => row(`2026-09-${d}`, { rating: 10 })) };
  const all = [sep, aug];
  assert.equal(monthInsight(aug, all), '7 titles and a 5-day streak. Your busiest month.');
  assert.equal(monthInsight(sep, all), 'Your kindest month: 5 stars on average, nothing under 3.');
  assert.equal(monthInsight({ year: 2026, month: 1, entries: [] }, all), null);
  const dnfOnly = { year: 2026, month: 2, entries: [row('2026-03-01', { dnf: true })] };
  assert.equal(monthInsight(dnfOnly, [dnfOnly]), "The one you didn't finish.");
});

test('yearSentence', () => {
  assert.equal(
    yearSentence({ count: 57, topGenre: 'Drama', weekday: { name: 'Sunday', count: 19, total: 57 }, dnf: 1 }),
    "Mostly drama, a third of it on Sundays and one you didn't finish.",
  );
  assert.equal(yearSentence({ count: 3, topGenre: null, weekday: { name: 'Monday', count: 1, total: 3 }, dnf: 0 }), null);
  assert.equal(yearSentence({ count: 0 }), null);
});
