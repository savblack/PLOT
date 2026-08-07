import assert from 'node:assert/strict';
import test from 'node:test';

import { IANA_TIMEZONES } from '../../timezones.js';

test('IANA_TIMEZONES is a non-empty array of unique strings', () => {
  assert.ok(Array.isArray(IANA_TIMEZONES));
  assert.ok(IANA_TIMEZONES.length > 100);
  assert.ok(IANA_TIMEZONES.every(tz => typeof tz === 'string' && tz.length > 0));
  assert.equal(new Set(IANA_TIMEZONES).size, IANA_TIMEZONES.length);
});

test('IANA_TIMEZONES includes UTC and common regional zones', () => {
  assert.ok(IANA_TIMEZONES.includes('UTC'));
  assert.ok(IANA_TIMEZONES.includes('America/New_York'));
  assert.ok(IANA_TIMEZONES.includes('Australia/Sydney'));
  assert.ok(IANA_TIMEZONES.includes('Europe/London'));
});

test('every entry is a valid IANA timezone recognized by Intl', () => {
  for (const tz of IANA_TIMEZONES) {
    assert.doesNotThrow(() => new Intl.DateTimeFormat('en', { timeZone: tz }), `${tz} should be a valid timezone`);
  }
});
