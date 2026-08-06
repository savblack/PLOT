import assert from 'node:assert/strict';
import test from 'node:test';

import {
  parseCSV,
  fuzzyCol,
  findCol,
  normaliseDate,
  detectDayFirst,
  parseLetterboxd,
  parseNetflix,
  parsePrime,
  parseDisney,
  parseMax,
  parseApple,
  parsePlatform,
  watchedAtFor,
} from '../../importParsing.js';

function withTZ(tz, fn) {
  const original = process.env.TZ;
  process.env.TZ = tz;
  try {
    return fn();
  } finally {
    if (original === undefined) delete process.env.TZ;
    else process.env.TZ = original;
  }
}

test('parseCSV splits plain rows on commas and newlines', () => {
  assert.deepEqual(parseCSV('a,b,c\n1,2,3'), [['a', 'b', 'c'], ['1', '2', '3']]);
});

test('parseCSV handles quoted fields containing commas', () => {
  assert.deepEqual(parseCSV('"a,b",c\n1,2'), [['a,b', 'c'], ['1', '2']]);
});

test('parseCSV unescapes doubled quotes inside quoted fields', () => {
  assert.deepEqual(parseCSV('"He said ""hi""",x'), [['He said "hi"', 'x']]);
});

test('parseCSV normalises CRLF and trailing-CRLF rows', () => {
  assert.deepEqual(parseCSV('a,b\r\n1,2\r\n'), [['a', 'b'], ['1', '2']]);
});

test('parseCSV returns an empty array for empty input', () => {
  assert.deepEqual(parseCSV(''), []);
});

test('parseCSV includes the final row even without a trailing newline', () => {
  assert.deepEqual(parseCSV('a,b'), [['a', 'b']]);
});

test('fuzzyCol lowercases and strips non-alphanumeric characters', () => {
  assert.equal(fuzzyCol('Watched Date'), 'watcheddate');
  assert.equal(fuzzyCol('Date-Watched!!'), 'datewatched');
  assert.equal(fuzzyCol(''), '');
});

test('findCol matches the first candidate that fuzzy-matches any header', () => {
  assert.equal(findCol(['id', 'name really', 'title'], 'title'), 2);
  assert.equal(findCol(['id', 'name really', 'title'], 'missing', 'title'), 2);
});

test('findCol candidate order determines which column wins when several could match', () => {
  const headers = ['id', 'name really', 'title'];
  assert.equal(findCol(headers, 'title', 'name'), 2);
  assert.equal(findCol(headers, 'name', 'title'), 1);
});

test('findCol returns -1 when no header matches any candidate', () => {
  assert.equal(findCol(['id', 'value'], 'title', 'name'), -1);
});

test('normaliseDate returns null for empty input', () => {
  assert.equal(normaliseDate(null), null);
  assert.equal(normaliseDate(''), null);
  assert.equal(normaliseDate(undefined), null);
});

test('normaliseDate passes through ISO dates and trims time components', () => {
  assert.equal(normaliseDate('2024-01-05'), '2024-01-05');
  assert.equal(normaliseDate('2024-01-05T10:00:00Z'), '2024-01-05');
});

test('normaliseDate resolves slash dates unambiguously when a segment exceeds 12', () => {
  assert.equal(normaliseDate('25/03/2024'), '2024-03-25');
  assert.equal(normaliseDate('03/25/2024'), '2024-03-25');
});

test('normaliseDate defaults ambiguous slash dates to MM/DD/YYYY', () => {
  assert.equal(normaliseDate('03/04/2024'), '2024-03-04');
});

test('normaliseDate honors dayFirst for ambiguous slash dates', () => {
  assert.equal(normaliseDate('03/04/2024', { dayFirst: true }), '2024-04-03');
});

test('normaliseDate falls back to native Date parsing for other formats', () => {
  assert.equal(normaliseDate('July 4, 1990 UTC'), '1990-07-04');
});

test('normaliseDate returns null when native parsing also fails', () => {
  assert.equal(normaliseDate('not a date'), null);
});

test('detectDayFirst is false when no row is unambiguously day-first', () => {
  assert.equal(detectDayFirst(['03/04/2024', '05/06/2024']), false);
});

test('detectDayFirst is true as soon as one row has a day segment over 12', () => {
  assert.equal(detectDayFirst(['03/04/2024', '25/03/2024']), true);
});

test('detectDayFirst skips falsy entries while scanning', () => {
  assert.equal(detectDayFirst(['', null, undefined, '13/01/2024']), true);
});

test('parseLetterboxd extracts title, year, doubled rating, and note', () => {
  const csv = [
    'Date,Name,Year,Letterboxd URI,Rating,Rewatch,Tags,Watched Date',
    '2024-01-10,Inception,2010,uri,4.5,false,,2024-01-09',
    '2024-01-11,No Rating Film,2015,uri2,,false,,',
  ].join('\n');

  assert.deepEqual(parseLetterboxd(csv), [
    { title: 'Inception', hint: 'movie', date: '2024-01-09', year: '2010', rating: 9, note: null },
    { title: 'No Rating Film', hint: 'movie', date: null, year: '2015', rating: null, note: null },
  ]);
});

test('parseLetterboxd prefers the Watched Date column over the logged Date column', () => {
  const csv = 'Date,Name,Watched Date\n2024-05-01,A Film,2024-04-20';
  assert.equal(parseLetterboxd(csv)[0].date, '2024-04-20');
});

test('parseLetterboxd treats a 0 rating the same as no rating', () => {
  assert.equal(parseLetterboxd('Name,Rating\nSomeFilm,0')[0].rating, null);
});

test('parseLetterboxd returns an empty array without a header+data row or a title column', () => {
  assert.deepEqual(parseLetterboxd('Name\n'), []);
  assert.deepEqual(parseLetterboxd('Foo,Bar\n1,2'), []);
});

test('parseNetflix splits "Show: Season X: Episode" into the series title with a tv hint', () => {
  const rows = parseNetflix('Title,Date\n"Stranger Things: Season 1: Chapter One",01/15/2024');
  assert.deepEqual(rows, [{ title: 'Stranger Things', hint: 'tv', date: '2024-01-15' }]);
});

test('parseNetflix splits "Show: Season X" into the series title with a tv hint', () => {
  const rows = parseNetflix('Title,Date\n"Stranger Things: Season 1",01/15/2024');
  assert.deepEqual(rows, [{ title: 'Stranger Things', hint: 'tv', date: '2024-01-15' }]);
});

test('parseNetflix leaves a plain movie title alone with an unknown hint', () => {
  const rows = parseNetflix('Title,Date\nInception,01/15/2024');
  assert.deepEqual(rows, [{ title: 'Inception', hint: 'unknown', date: '2024-01-15' }]);
});

test('parseNetflix does not split a colon subtitle that is not a season/episode marker', () => {
  const rows = parseNetflix('Title,Date\n"Mission: Impossible",01/15/2024');
  assert.deepEqual(rows, [{ title: 'Mission: Impossible', hint: 'unknown', date: '2024-01-15' }]);
});

test('parseNetflix returns an empty array without a title column or data rows', () => {
  assert.deepEqual(parseNetflix('Title,Date\n'), []);
  assert.deepEqual(parseNetflix('Foo,Bar\n1,2'), []);
});

test('parsePrime always reports an unknown hint and reads the watched date', () => {
  const rows = parsePrime('Title,Watched Date\n"The Wire: Season 1",03/04/2024');
  assert.deepEqual(rows, [{ title: 'The Wire: Season 1', hint: 'unknown', date: '2024-03-04' }]);
});

test('parsePrime returns an empty array without a title column or data rows', () => {
  assert.deepEqual(parsePrime('Title\n'), []);
  assert.deepEqual(parsePrime('Foo\n1'), []);
});

test('parseDisney reads items from a wrapped object and infers a tv hint from seriesTitle', () => {
  const text = JSON.stringify({
    data: [
      { seriesTitle: 'Show', watchedAt: '2024-01-01' },
      { contentTitle: 'Movie', date: '2024-01-02' },
      { title: '' },
    ],
  });
  assert.deepEqual(parseDisney(text), [
    { title: 'Show', hint: 'tv', date: '2024-01-01' },
    { title: 'Movie', hint: 'unknown', date: '2024-01-02' },
  ]);
});

test('parseDisney accepts a bare top-level array', () => {
  const text = JSON.stringify([{ title: 'Direct Array Item', date: '2024-02-02' }]);
  assert.deepEqual(parseDisney(text), [{ title: 'Direct Array Item', hint: 'unknown', date: '2024-02-02' }]);
});

test('parseDisney throws on invalid JSON rather than returning an empty array', () => {
  assert.throws(() => parseDisney('not json'), SyntaxError);
});

test('parseMax JSON path detects tv only from a "series" substring in Content Type', () => {
  const seriesText = JSON.stringify({ data: [{ Title: 'Show2', 'Content Type': 'Series', 'Date Watched': '2024-01-01' }] });
  assert.equal(parseMax(seriesText)[0].hint, 'tv');
});

test('parseMax JSON path misses a "TV Show" Content Type that the CSV fallback would catch (see summary)', () => {
  const tvShowText = JSON.stringify({ data: [{ Title: 'ShowY', 'Content Type': 'TV Show', 'Date Watched': '2024-01-05' }] });
  assert.equal(parseMax(tvShowText)[0].hint, 'unknown');
});

test('parseMax falls back to CSV parsing on invalid JSON and matches "tv" or "series" in the type column', () => {
  const csvRows = parseMax('Title,Content Type,Date Watched\nShowX,TV Series,01/05/2024\nShowY,TV Show,01/06/2024\nMovieZ,Film,01/07/2024');
  assert.deepEqual(csvRows, [
    { title: 'ShowX', hint: 'tv', date: '2024-01-05' },
    { title: 'ShowY', hint: 'tv', date: '2024-01-06' },
    { title: 'MovieZ', hint: 'unknown', date: '2024-01-07' },
  ]);
});

test('parseMax CSV fallback returns an empty array without a title column', () => {
  assert.deepEqual(parseMax('Foo,Bar\n1,2'), []);
});

test('parseApple infers a tv hint from Series_Title or a tv-flavored Media_Type', () => {
  const text = JSON.stringify([
    { Series_Title: 'Show', Event_End_Timestamp: '2024-01-01' },
    { Item_Description: 'Movie', Media_Type: 'Feature Film', date: '2024-01-02' },
    { Item_Description: 'TV special', Media_Type: 'TV Program', date: '2024-01-03' },
  ]);
  assert.deepEqual(parseApple(text), [
    { title: 'Show', hint: 'tv', date: '2024-01-01' },
    { title: 'Movie', hint: 'unknown', date: '2024-01-02' },
    { title: 'TV special', hint: 'tv', date: '2024-01-03' },
  ]);
});

test('parseApple throws on invalid JSON rather than returning an empty array', () => {
  assert.throws(() => parseApple('not json'), SyntaxError);
});

test('parsePlatform dispatches to the parser matching the platform id', () => {
  assert.deepEqual(parsePlatform('netflix', 'Title,Date\nInception,01/15/2024'), [{ title: 'Inception', hint: 'unknown', date: '2024-01-15' }]);
  assert.deepEqual(parsePlatform('letterboxd', 'Name\n'), []);
});

test('parsePlatform returns an empty array for an unknown platform id', () => {
  assert.deepEqual(parsePlatform('unknown-platform', 'anything'), []);
  assert.deepEqual(parsePlatform(undefined, 'anything'), []);
});

test('watchedAtFor keeps the given date for typical timezone offsets', () => {
  withTZ('America/New_York', () => {
    assert.equal(watchedAtFor({ date: '2024-06-15' }), '2024-06-15');
  });
  withTZ('Australia/Sydney', () => {
    assert.equal(watchedAtFor({ date: '2024-06-15' }), '2024-06-15');
  });
});

test('BUG: watchedAtFor rolls the date back a day in timezones 13+ hours ahead of UTC', () => {
  withTZ('Pacific/Kiritimati', () => {
    assert.equal(watchedAtFor({ date: '2024-06-15' }), '2024-06-14');
  });
});

test('BUG: watchedAtFor with no source date uses the UTC date regardless of the local timezone', () => {
  const expectedUtcToday = new Date().toISOString().slice(0, 10);
  const utcResult = withTZ('UTC', () => watchedAtFor({}));
  const kiritimatiResult = withTZ('Pacific/Kiritimati', () => watchedAtFor({}));
  assert.equal(utcResult, expectedUtcToday);
  assert.equal(kiritimatiResult, expectedUtcToday);
});
