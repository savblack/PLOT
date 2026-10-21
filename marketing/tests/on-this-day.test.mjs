import test from 'node:test';
import assert from 'node:assert/strict';
import { keepsPrimaryAnniversary } from '../planner/triggers/on-this-day.mjs';

test('the US opening itself is the anniversary', () => {
  assert.equal(keepsPrimaryAnniversary('2016-10-21', '2016-10-21'), true);
});

test('a premiere a few days early is not the anniversary', () => {
  assert.equal(keepsPrimaryAnniversary('2016-08-03', '2016-08-05'), false);
});

test('a US opening thirty days from the primary date is the same season', () => {
  // Weekend opened in US theaters on 23 September 2011. TMDB's primary date
  // is 23 October 2011. That is one release, and October is the wrong birthday.
  assert.equal(keepsPrimaryAnniversary('2011-09-23', '2011-10-23'), false);
});

test('a US opening months later leaves the original release in place', () => {
  assert.equal(keepsPrimaryAnniversary('2002-04-05', '2001-05-09'), true);
});

test('no US theatrical date keeps the primary date', () => {
  assert.equal(keepsPrimaryAnniversary(null, '2011-10-23'), true);
});
