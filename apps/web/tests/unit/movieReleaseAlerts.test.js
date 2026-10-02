import test from 'node:test';
import assert from 'node:assert/strict';
import {
  MOVIE_LOOK_BACK_DAYS, PRIMARY_DATE_FUTURE_DAYS, PRIMARY_DATE_PAST_DAYS,
  movieReleaseKey, regionsInWindow, skipReason, worthChecking,
} from '../../../../supabase/functions/_shared/movieReleaseAlerts.js';
import { personReleaseKey } from '../../../../supabase/functions/_shared/premiumAlerts.js';

// The rules behind Free movie release notifications. The bar is that a false
// alert is worse than a late one, so most of these pin down what stays silent.
//
// Ids are negative on purpose: they are not TMDB ids (AGENTS.md: never guess
// one) and the rules only use them as keys.

const TODAY = '2026-10-03';
const SINCE = '2026-09-30';

const releases = (region, ...dates) => ({ results: [{ iso_3166_1: region, release_dates: dates.map(([type, d]) => ({ type, release_date: `${d}T00:00:00.000Z` })) }] });

test('the look-back matches the people alerts, so the two jobs agree on "just out"', () => {
  assert.equal(MOVIE_LOOK_BACK_DAYS, 3);
});

test('worthChecking keeps films that could plausibly be out, and unknown dates', () => {
  assert.equal(worthChecking('2026-09-30', TODAY), true);
  assert.equal(worthChecking('2026-10-03', TODAY), true);
  // A region can get a film months after its primary date.
  assert.equal(worthChecking('2026-01-15', TODAY), true);
  assert.equal(worthChecking('2026-10-12', TODAY), true);
  // Too far ahead or too long ago to be new: not looked up.
  assert.equal(worthChecking('2026-10-14', TODAY), false);
  assert.equal(worthChecking('2025-10-01', TODAY), false);
  // Older saves have no date; skipping them would mean never alerting.
  for (const missing of [null, undefined, '', 'soon', 20260101]) assert.equal(worthChecking(missing, TODAY), true);
  assert.equal(PRIMARY_DATE_PAST_DAYS, 365);
  assert.equal(PRIMARY_DATE_FUTURE_DAYS, 10);
});

test('regionsInWindow lists only the regions where the first general release is in range', () => {
  const body = { results: [
    ...releases('AU', [3, '2026-10-01']).results,
    ...releases('US', [3, '2026-08-01'], [4, '2026-10-02']).results,
    ...releases('GB', [3, '2026-10-20']).results,
    ...releases('NZ', [1, '2026-10-01'], [2, '2026-10-02']).results,
  ] };
  // AU: in cinemas two days ago. US: cinemas two months ago, so the digital
  // release today is not a new release. GB: not out yet. NZ: only a premiere
  // and a limited run, which never count.
  assert.deepEqual(regionsInWindow(body, TODAY, SINCE), { AU: { kind: 'theatrical', date: '2026-10-01' } });
  assert.deepEqual(regionsInWindow(null, TODAY, SINCE), {});
  assert.deepEqual(regionsInWindow({}, TODAY, SINCE), {});
});

test('regionsInWindow counts the edges of the window and takes the digital release when it is first', () => {
  assert.deepEqual(regionsInWindow(releases('AU', [4, '2026-09-30']), TODAY, SINCE), { AU: { kind: 'digital', date: '2026-09-30' } });
  assert.deepEqual(regionsInWindow(releases('AU', [3, '2026-10-03']), TODAY, SINCE), { AU: { kind: 'theatrical', date: '2026-10-03' } });
  assert.deepEqual(regionsInWindow(releases('AU', [3, '2026-09-29']), TODAY, SINCE), {});
  assert.deepEqual(regionsInWindow(releases('AU', [3, '2026-10-04']), TODAY, SINCE), {});
});

test('skipReason: someone who watched it, or saved it once it was out, is not told', () => {
  const release = { date: '2026-10-01' };
  assert.equal(skipReason({ savedAt: '2026-08-01T10:00:00Z', watched: false }, release), null);
  assert.equal(skipReason({ savedAt: '2026-09-30T23:59:00Z', watched: false }, release), null);
  assert.equal(skipReason({ savedAt: '2026-10-01T00:00:00Z', watched: false }, release), 'added_on_or_after');
  assert.equal(skipReason({ savedAt: '2026-10-02T09:00:00Z', watched: false }, release), 'added_on_or_after');
  assert.equal(skipReason({ savedAt: '2026-08-01T10:00:00Z', watched: true }, release), 'watched');
  // Watched wins over a late save: it is the more specific reason.
  assert.equal(skipReason({ savedAt: '2026-10-02T09:00:00Z', watched: true }, release), 'watched');
});

test('skipReason: an unknown save time counts as long ago, so an old row is never dropped', () => {
  assert.equal(skipReason({ savedAt: null, watched: false }, { date: '2026-10-01' }), null);
  assert.equal(skipReason({ savedAt: 'not a date', watched: false }, { date: '2026-10-01' }), null);
});

test('one notification per person per film, shared with the people alerts', () => {
  assert.equal(movieReleaseKey(-7), 'person_release:movie:-7');
  // The same key premium-alerts writes for a followed person's film, so the
  // unique (user_id, dedupe_key) index lets only the first of the two through.
  assert.equal(movieReleaseKey(-7), personReleaseKey('movie', -7));
});
