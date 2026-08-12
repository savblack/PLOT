import assert from 'node:assert/strict';
import test from 'node:test';
import {
  parseNetflix, parsePrime, parseDisney, parseMax, parseApple, parsePlatform,
  normaliseDate, detectDayFirst,
} from '@plot/core/importParsing.js';

test('parseNetflix detects TV from "Show: Season N: Episode" and parses date', () => {
  const csv = [
    'Title,Date',
    '"Breaking Bad: Season 1: Pilot",01/15/2024',
    'Inception,02/20/2024',
  ].join('\n');
  const rows = parseNetflix(csv);
  assert.equal(rows[0].title, 'Breaking Bad');
  assert.equal(rows[0].hint, 'tv');
  assert.equal(rows[0].date, '2024-01-15'); // MM/DD/YYYY (Netflix default)
  assert.equal(rows[1].title, 'Inception');
  assert.equal(rows[1].hint, 'unknown');
});

test('parsePrime reads title + watched date, hint unknown', () => {
  const csv = ['Title,Watched Date', 'The Boys,2024-03-10'].join('\n');
  const [row] = parsePrime(csv);
  assert.equal(row.title, 'The Boys');
  assert.equal(row.hint, 'unknown');
  assert.equal(row.date, '2024-03-10');
});

test('parseDisney reads seriesTitle (tv) from wrapped JSON', () => {
  const json = JSON.stringify({ watchHistory: [
    { seriesTitle: 'The Mandalorian', watchedAt: '2024-04-01' },
    { contentTitle: 'Soul', watchedAt: '2024-04-02' },
  ]});
  const rows = parseDisney(json);
  assert.equal(rows[0].title, 'The Mandalorian');
  assert.equal(rows[0].hint, 'tv');
  assert.equal(rows[1].title, 'Soul');
  assert.equal(rows[1].hint, 'unknown');
});

test('parseMax handles JSON and CSV, detecting series', () => {
  const json = JSON.stringify([{ Title: 'Succession', 'Content Type': 'Series', 'Date Watched': '2024-05-01' }]);
  assert.equal(parseMax(json)[0].hint, 'tv');
  const csv = ['Title,Date Watched,Content Type', 'Dune,2024-05-02,Movie'].join('\n');
  const [row] = parseMax(csv);
  assert.equal(row.title, 'Dune');
  assert.equal(row.hint, 'unknown');
  assert.equal(row.date, '2024-05-02');
});

test('parseApple prefers Series_Title and reads end timestamp', () => {
  const json = JSON.stringify({ PlayHistory: [
    { Series_Title: 'Ted Lasso', Event_End_Timestamp: '2024-06-01T20:00:00Z' },
  ]});
  const [row] = parseApple(json);
  assert.equal(row.title, 'Ted Lasso');
  assert.equal(row.hint, 'tv');
  assert.equal(row.date, '2024-06-01');
});

test('parsePlatform dispatches by id and returns [] for unknown', () => {
  const csv = ['Title,Date', 'Arcane,2024-07-01'].join('\n');
  assert.equal(parsePlatform('netflix', csv)[0].title, 'Arcane');
  assert.deepEqual(parsePlatform('nope', csv), []);
});

// SUS-60: regional (DD/MM/YYYY) exports were silently misread as MM/DD/YYYY
// whenever both segments were <= 12.
test('normaliseDate resolves unambiguous DD/MM/YYYY regardless of dayFirst', () => {
  assert.equal(normaliseDate('25/03/2024'), '2024-03-25'); // day=25 > 12, unambiguous
  assert.equal(normaliseDate('25/03/2024', { dayFirst: false }), '2024-03-25');
});

test('normaliseDate uses the ISO branch untouched by dayFirst', () => {
  assert.equal(normaliseDate('2024-03-04T10:00:00Z', { dayFirst: true }), '2024-03-04');
});

test('normaliseDate defaults ambiguous DD/MM to MM/DD (Netflix default) without a hint', () => {
  assert.equal(normaliseDate('03/04/2024'), '2024-03-04'); // March 4
});

test('normaliseDate reads ambiguous DD/MM as day-first when the file convention says so', () => {
  assert.equal(normaliseDate('03/04/2024', { dayFirst: true }), '2024-04-03'); // 3 April
});

test('detectDayFirst infers DD/MM from any unambiguous row in the column', () => {
  assert.equal(detectDayFirst(['03/04/2024', '25/12/2024']), true); // 25 > 12 proves day-first
  assert.equal(detectDayFirst(['03/04/2024', '01/02/2024']), false); // all ambiguous → default
  assert.equal(detectDayFirst([]), false);
});

test('parseNetflix applies the file-detected convention to every ambiguous row', () => {
  const csv = [
    'Title,Date',
    'Show A,03/04/2024',  // ambiguous on its own
    'Show B,25/12/2024',  // proves the file is DD/MM/YYYY
  ].join('\n');
  const rows = parseNetflix(csv);
  assert.equal(rows[0].date, '2024-04-03'); // read as 3 April, not March 4
  assert.equal(rows[1].date, '2024-12-25');
});
