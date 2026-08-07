import assert from 'node:assert/strict';
import test from 'node:test';

import { setUserTimezone, getUserTimezone, localDateStr, dateToLocalStr } from '../../date.js';

test.afterEach(() => {
  setUserTimezone(null);
});

test('getUserTimezone defaults to null', () => {
  assert.equal(getUserTimezone(), null);
});

test('setUserTimezone/getUserTimezone round-trips a value', () => {
  setUserTimezone('Australia/Sydney');
  assert.equal(getUserTimezone(), 'Australia/Sydney');
});

test('setUserTimezone treats falsy values as null', () => {
  setUserTimezone('Europe/London');
  setUserTimezone('');
  assert.equal(getUserTimezone(), null);

  setUserTimezone('Europe/London');
  setUserTimezone(undefined);
  assert.equal(getUserTimezone(), null);
});

test('localDateStr with no timezone set matches device-local today', () => {
  const d = new Date();
  const expected = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  assert.equal(localDateStr(), expected);
});

test('localDateStr with no timezone set applies a day offset via native Date arithmetic', () => {
  const d = new Date();
  d.setDate(d.getDate() + 3);
  const expected = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  assert.equal(localDateStr(3), expected);
});

test('localDateStr with UTC timezone matches toISOString date for offset 0', () => {
  setUserTimezone('UTC');
  const expected = new Date().toISOString().slice(0, 10);
  assert.equal(localDateStr(0), expected);
  assert.equal(localDateStr(), expected);
});

test('localDateStr with UTC timezone applies offsets as whole calendar days', () => {
  setUserTimezone('UTC');
  const expectedTomorrow = new Date(Date.now() + 86400000).toISOString().slice(0, 10);
  const expectedYesterday = new Date(Date.now() - 86400000).toISOString().slice(0, 10);
  assert.equal(localDateStr(1), expectedTomorrow);
  assert.equal(localDateStr(-1), expectedYesterday);
});

test('localDateStr falls back to device-local date when the timezone is invalid', () => {
  setUserTimezone('Not/ARealZone');
  const d = new Date();
  const expected = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  assert.equal(localDateStr(), expected);
});

test('dateToLocalStr with no timezone set uses the Date object local components', () => {
  const d = new Date(2024, 0, 5, 23, 30);
  assert.equal(dateToLocalStr(d), '2024-01-05');
});

test('dateToLocalStr with UTC timezone uses the UTC calendar date', () => {
  setUserTimezone('UTC');
  const d = new Date('2024-03-01T23:30:00Z');
  assert.equal(dateToLocalStr(d), '2024-03-01');
});

test('dateToLocalStr with a timezone behind UTC can roll the date backward', () => {
  setUserTimezone('America/New_York');
  const d = new Date('2024-03-01T02:00:00Z');
  assert.equal(dateToLocalStr(d), '2024-02-29');
});

test('dateToLocalStr with a timezone ahead of UTC can roll the date forward', () => {
  setUserTimezone('Australia/Sydney');
  const d = new Date('2024-01-15T20:00:00Z');
  assert.equal(dateToLocalStr(d), '2024-01-16');
});

test('dateToLocalStr falls back to Date object local components when the timezone is invalid', () => {
  setUserTimezone('Not/ARealZone');
  const d = new Date(2024, 5, 15, 12, 0);
  assert.equal(dateToLocalStr(d), '2024-06-15');
});
