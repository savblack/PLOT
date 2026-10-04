import assert from 'node:assert/strict';
import test from 'node:test';

import {
  CARD_IDS, CARD_FORMATS, THRESHOLDS,
  highlightsCard, streakCard, top5Card, buildShareCards, presetIndex, shareCaption, cardFilename, leadWithTop5, monthWrapCard,
  activityCard, shareCardPalette, crowdCard, genresCard, personCard,
} from '../../shareCards.js';
import { detailsKey } from '../../historyStats.js';
import { SHARE_CARDS } from '../../copy/shareCards.js';
import { themeFamilyVariants } from '../../tokens.js';

let nextId = 1;
const row = (watched_at, extra = {}) => ({
  id: nextId++, tmdb_id: nextId * 10, media_type: 'movie', title: `Title ${nextId}`,
  watched_at, rating: null, note: null, dnf: false, genre_ids: [], created_at: watched_at, ...extra,
});
const days = (n) => Array.from({ length: n }, (_, i) => {
  const d = new Date(Date.UTC(2026, 8, 1 + i));
  return row(d.toISOString().slice(0, 10));
});
const NOW = new Date(2026, 8, 20);
const withDetails = (entries, fn) => new Map(entries.map(e => [detailsKey(e), fn(e)]));

test('highlights card: tiles only for what exists, locked under ten titles', () => {
  const es = [row('2026-01-02', { rating: 8, genre_ids: [27] }), row('2026-02-03', { rating: 9, genre_ids: [27] })];
  const details = new Map(es.map(e => [detailsKey(e), { runtime: 100 }]));
  const c = highlightsCard({ entries: es, details, genreName: id => (id === 27 ? 'Horror' : null), year: 2026, now: NOW });
  assert.equal(c.id, CARD_IDS.HIGHLIGHTS);
  assert.equal(c.isCurrentYear, true);
  assert.deepEqual(c.tiles.map(t => t.key), ['titles', 'onScreen', 'genre', 'rating']);
  assert.equal(c.tiles[0].value, '2');
  assert.equal(c.tiles[1].value, '3h 20m');
  assert.equal(c.tiles[2].value, 'Horror');
  assert.equal(c.tiles[3].value, '4.5★');
  assert.deepEqual(c.need, { have: 2, needed: THRESHOLDS.highlightsTitles, met: false });

  const bare = highlightsCard({ entries: [row('2026-01-02')], year: 2026, now: NOW });
  assert.deepEqual(bare.tiles.map(t => t.key), ['titles']);
});

test('highlights card unlocks at ten titles and caps the count shown', () => {
  const c = highlightsCard({ entries: days(12), year: 2026, now: NOW });
  assert.equal(c.need.met, true);
  assert.equal(c.need.have, 10);
  assert.equal(c.count, 12);
});

test('streak card follows the current streak and locks under three days', () => {
  const es2 = [row('2026-09-18'), row('2026-09-19'), row('2026-09-20')];
  assert.equal(streakCard({ entries: es2, now: NOW }).days, 3);
  assert.equal(streakCard({ entries: es2, now: NOW }).need.met, true);
  assert.equal(streakCard({ entries: [row('2026-09-20')], now: NOW }).need.met, false);
  assert.equal(streakCard({ entries: [], now: NOW }).days, 0);
});

test('top 5 card sorts by rank, drops junk ranks and names the owner', () => {
  const items = [
    { rank: 3, tmdb_id: 3, title: 'C', poster_path: '/c.jpg' },
    { rank: 1, tmdb_id: 1, title: 'A', poster_path: '/a.jpg' },
    { rank: 9, tmdb_id: 9, title: 'junk', poster_path: null },
    { rank: 2, tmdb_id: 2, title: 'B', poster_path: null },
  ];
  const c = top5Card({ items, kind: 'movies', profile: { display_name: 'Savannah', username: 'savannah' } });
  assert.equal(c.id, CARD_IDS.TOP5_MOVIES);
  assert.deepEqual(c.items.map(i => i.title), ['A', 'B', 'C']);
  assert.equal(c.items[1].poster_path, null);
  assert.equal(c.owner, "Savannah's");
  assert.equal(c.handle, '@savannah');
  assert.deepEqual(c.need, { have: 3, needed: 5, met: false });

  const tv = top5Card({ items: [], kind: 'tv', profile: { username: 'james' } });
  assert.equal(tv.id, CARD_IDS.TOP5_TV);
  assert.equal(tv.owner, "james'");
  assert.equal(tv.ground, 'sage');
});

test('possessive handles names ending in s and no name at all', () => {
  assert.equal(top5Card({ kind: 'movies', profile: { display_name: 'Chris' } }).owner, "Chris'");
  assert.equal(top5Card({ kind: 'movies', profile: {} }).owner, '');
  assert.equal(top5Card({ kind: 'movies', profile: {} }).handle, null);
});

test('buildShareCards keeps carousel order and marks availability', () => {
  const five = [1, 2, 3, 4, 5].map(rank => ({ rank, tmdb_id: rank, title: `T${rank}`, poster_path: null }));
  const cards = buildShareCards({
    entries: days(12), year: 2026, now: NOW,
    topLists: { movies: five, tv: five.slice(0, 2) },
    profile: { username: 'sav' },
  });
  assert.deepEqual(cards.map(c => c.id), [CARD_IDS.HIGHLIGHTS, CARD_IDS.STREAK, CARD_IDS.ACTIVITY, CARD_IDS.CROWD, CARD_IDS.TOP5_MOVIES, CARD_IDS.TOP5_TV, CARD_IDS.GENRES, CARD_IDS.PERSON, CARD_IDS.MONTH_WRAP]);
  assert.deepEqual(cards.map(c => c.available), [true, false, false, false, true, false, false, false, false]);
  assert.equal(presetIndex(cards, CARD_IDS.TOP5_MOVIES), 4);
  assert.equal(presetIndex(cards, 'nope'), 0);
  // The profile's order: both Top 5s first, then the year cards.
  assert.deepEqual(leadWithTop5(cards).map(c => c.id).slice(0, 3), [CARD_IDS.TOP5_MOVIES, CARD_IDS.TOP5_TV, CARD_IDS.HIGHLIGHTS]);
  assert.equal(presetIndex(leadWithTop5(cards), CARD_IDS.TOP5_MOVIES), 0);
});

test('captions end with the profile link and read as a post', () => {
  const profile = { username: 'savannah' };
  const hl = highlightsCard({ entries: days(12), genreName: () => 'Horror', year: 2026, now: NOW });
  hl.genre = 'Horror';
  assert.equal(shareCaption(hl, profile, SHARE_CARDS.captions), '12 titles in 2026 so far, mostly horror. https://app.theplot.tv/u/savannah?src=profile_share&ref=savannah');
  const st = { id: CARD_IDS.STREAK, days: 7 };
  assert.match(shareCaption(st, profile, SHARE_CARDS.captions), /^7-day watch streak on Plot\. https:/);
  const t5 = { id: CARD_IDS.TOP5_TV, kind: 'tv' };
  assert.match(shareCaption(t5, profile, SHARE_CARDS.captions), /^My Top 5 TV series on Plot\. Follow me: https:/);
  assert.equal(shareCaption({ id: 'x' }, {}, SHARE_CARDS.captions), '');
});

test('formats and filenames', () => {
  assert.deepEqual(CARD_FORMATS.post, { id: 'post', width: 1200, height: 800 });
  assert.deepEqual(CARD_FORMATS.story, { id: 'story', width: 1080, height: 1920 });
  assert.equal(cardFilename({ id: CARD_IDS.STREAK }, 'story'), 'plot-streak-story.png');
});

test('month wrap card: last month only, best night, five stars, dnf', () => {
  const d = (n, extra = {}) => row(`2026-08-${String(n).padStart(2, '0')}`, extra);
  const es = [d(23, { rating: 10, title: 'Aftersun' }), d(23), d(23, { rating: 10, title: 'Heat' }), d(9, { dnf: true }), d(2), d(30, { rating: 7 }), row('2026-09-02'), row('2026-07-30')];
  const c = monthWrapCard({ entries: es, now: NOW });
  assert.equal(c.id, CARD_IDS.MONTH_WRAP);
  assert.equal(c.monthName, 'August');
  assert.equal(c.count, 6);
  assert.deepEqual(c.bestNight, { day: 23, count: 3, label: 'Sun 23' });
  assert.deepEqual(c.fiveStars, ['Aftersun', 'Heat']);
  assert.equal(c.dnf, 1);
  assert.equal(c.need.met, true);
  assert.equal(monthWrapCard({ entries: [], now: NOW }).bestNight, null);
  assert.match(shareCaption(c, { username: 'sav' }, SHARE_CARDS.captions), /^August, wrapped: 6 titles, 2 five-star\. https:/);
});

test('activity card: the year to date for a post, the last quarter for a story', () => {
  const es = [row('2026-09-19'), row('2026-09-19'), row('2026-09-19'), row('2026-09-18'), row('2026-09-01'), row('2026-01-01'), row('2025-12-31')];
  const c = activityCard({ entries: es, now: NOW });
  // 1 Jan 2026 is a Thursday; the week of Mon 29 Dec to the week of Mon 14 Sep is 38 columns.
  assert.equal(c.weeks.length, 38);
  assert.equal(c.weeks[0][0].before, true, 'Mon 29 Dec is before the year');
  assert.equal(c.weeks[0][3].before, false, 'Thu 1 Jan is the first day');
  assert.equal(c.weeks[0][3].count, 1);
  assert.equal(c.weeks[0][2].count, 0, 'last year is not counted');
  const last = c.weeks[37];
  const sat = last[5]; // 19 Sep 2026 is a Saturday
  assert.equal(sat.count, 3); assert.equal(sat.level, 3); assert.equal(sat.best, true);
  assert.equal(last[6].today, true, 'Sunday 20 Sep is today');
  assert.equal(last[4].level, 1);
  assert.deepEqual(c.best, { label: 'Sat 19 Sep', count: 3 });
  assert.equal(c.watchDays, 4, 'Dec 2025 is out, 1 Jan is in');
  assert.equal(c.need.met, false);
  assert.equal(c.months[0].label, 'Jan');
  assert.ok(c.months.length >= 9);

  assert.equal(c.quarter.weeks.length, 13);
  assert.equal(c.quarter.weeks[12][5].best, true);
  assert.deepEqual(c.quarter.best, { label: 'Sat 19 Sep', count: 3 });
  assert.equal(c.quarter.watchDays, 3, 'the quarter starts in late June, so January is out');
  assert.ok(c.quarter.months.length >= 3 && c.quarter.months.length <= 4);
});

test('activity card: early in the year the grid is only a few columns', () => {
  const c = activityCard({ entries: [row('2026-01-05')], now: new Date(2026, 0, 9) });
  assert.equal(c.weeks.length, 2);
  assert.equal(c.watchDays, 1);
});

test('share card palette: a family maps onto the card roles, the default stays literal', () => {
  assert.equal(shareCardPalette('default'), null);
  assert.equal(shareCardPalette(undefined), null);
  const p = shareCardPalette('mist');
  assert.equal(p['--sc-accent'], themeFamilyVariants.mist.light.accentFill);
  assert.equal(p['--sc-char'], themeFamilyVariants.mist.dark.surface);
  for (const f of Object.keys(themeFamilyVariants)) {
    const pal = shareCardPalette(f);
    assert.ok(pal && Object.values(pal).every(v => typeof v === 'string' && v.length), `${f} defines every role`);
  }
});

test('crowd card: gauge, delta glyph and the split sentence', () => {
  const es = Array.from({ length: 12 }, (_, i) => row(`2026-03-${String(i + 1).padStart(2, '0')}`, { rating: 8, title: `T${i}` }));
  es.push(row('2026-04-01', { rating: 2, title: 'Emilia Pérez' }));
  const details = withDetails(es, e => ({ vote_average: e.title === 'Emilia Pérez' ? 8 : 7 }));
  const c = crowdCard({ entries: es, details });
  assert.equal(c.compared, 13);
  assert.equal(c.word, 'kinder');
  assert.equal(c.delta, '+¼★');
  assert.ok(c.gauge > 0.5 && c.gauge < 0.7);
  assert.equal(c.headline, 'A quarter star kinder than the crowd.');
  assert.equal(c.except, 'Except about Emilia Pérez.');
  assert.equal(c.need.met, true);
  const none = crowdCard({ entries: [], details: new Map() });
  assert.equal(none.delta, '='); assert.equal(none.headline, null); assert.equal(none.need.met, false);
});

test('genres card: top five as a share of titles with genres', () => {
  const es = [...Array(12)].map((_, i) => row(`2026-02-${String(i + 1).padStart(2, '0')}`, { genre_ids: i < 8 ? [27] : [18, 35] }));
  const c = genresCard({ entries: es, genreName: id => ({ 27: 'Horror', 18: 'Drama', 35: 'Comedy' })[id] });
  assert.deepEqual(c.rows.map(r => [r.name, r.count, r.pct, r.width]), [['Horror', 8, 67, 100], ['Drama', 4, 33, 50], ['Comedy', 4, 33, 50]]);
  assert.deepEqual(c.need, { have: 12, needed: 20, met: false });
});

test('person card: the most recurring actor, locked under three titles', () => {
  const es = [row('2026-05-01', { title: 'A', rating: 10 }), row('2026-05-02', { title: 'B', rating: 10 }), row('2026-05-03', { title: 'C', rating: 10 }), row('2026-05-04', { title: 'D' })];
  const cast = [{ id: 7, name: 'Florence Pugh', profile_path: '/fp.jpg' }];
  const details = withDetails(es, e => ({ credits: { cast: e.title === 'D' ? [] : cast } }));
  const c = personCard({ entries: es, details });
  assert.equal(c.name, 'Florence Pugh');
  assert.deepEqual(c.titles, ['A', 'B', 'C']);
  assert.equal(c.count, 3);
  assert.match(c.line, /3 titles this year/);
  assert.equal(c.need.met, true);
  assert.equal(personCard({ entries: es.slice(0, 1), details }).need.met, false);
});
