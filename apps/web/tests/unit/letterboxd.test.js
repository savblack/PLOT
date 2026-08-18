import assert from 'node:assert/strict';
import test from 'node:test';
import { parseLetterboxd } from '@plot/core/importParsing.js';

test('parses diary.csv: title, year, watched date, doubled rating', () => {
  const csv = [
    'Date,Name,Year,Letterboxd URI,Rating,Rewatch,Tags,Watched Date',
    '2024-03-01,Past Lives,2023,https://boxd.it/x,4.5,,,2024-02-28',
  ].join('\n');
  const [row] = parseLetterboxd(csv);
  assert.equal(row.title, 'Past Lives');
  assert.equal(row.year, '2023');
  assert.equal(row.hint, 'movie');
  assert.equal(row.date, '2024-02-28'); // prefers "Watched Date" over logged "Date"
  assert.equal(row.rating, 9);          // 4.5 stars -> 9 on the 1-10 scale
  assert.equal(row.note, null);
});

test('captures review text as note', () => {
  const csv = [
    'Date,Name,Year,Letterboxd URI,Rating,Rewatch,Review,Watched Date,Tags',
    '2024-01-10,Sinners,2025,https://boxd.it/y,5,,"A swing for the fences.",2024-01-09,',
  ].join('\n');
  const [row] = parseLetterboxd(csv);
  assert.equal(row.rating, 10);
  assert.equal(row.note, 'A swing for the fences.');
});

test('handles blank ratings and missing watched date (watched.csv shape)', () => {
  const csv = [
    'Date,Name,Year,Letterboxd URI',
    '2024-05-05,Anora,2024,https://boxd.it/z',
  ].join('\n');
  const [row] = parseLetterboxd(csv);
  assert.equal(row.title, 'Anora');
  assert.equal(row.rating, null);       // no rating column -> null
  assert.equal(row.note, null);
  assert.equal(row.date, '2024-05-05'); // falls back to logged Date
});

test('skips blank title rows and tolerates an empty file', () => {
  assert.deepEqual(parseLetterboxd(''), []);
  const csv = [
    'Date,Name,Year,Letterboxd URI,Rating',
    '2024-05-05,,2024,https://boxd.it/z,3',
    '2024-05-06,Dune: Part Two,2024,https://boxd.it/a,4',
  ].join('\n');
  const rows = parseLetterboxd(csv);
  assert.equal(rows.length, 1);
  assert.equal(rows[0].title, 'Dune: Part Two'); // commas in title survive CSV parsing
  assert.equal(rows[0].rating, 8);
});
