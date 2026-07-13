import assert from 'node:assert/strict';
import test from 'node:test';
import {
  parseNetflix, parsePrime, parseDisney, parseMax, parseApple, parsePlatform,
} from '../../src/domain/importParsing.js';

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
