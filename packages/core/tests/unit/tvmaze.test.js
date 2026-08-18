import assert from 'node:assert/strict';
import test from 'node:test';

import { pickBestTvmazeShowMatch } from '../../tvmaze.js';

test('pickBestTvmazeShowMatch reports no-exact-title-match for empty input', () => {
  assert.deepEqual(pickBestTvmazeShowMatch(), { match: null, reason: 'no-exact-title-match' });
  assert.deepEqual(pickBestTvmazeShowMatch([], {}), { match: null, reason: 'no-exact-title-match' });
});

test('pickBestTvmazeShowMatch matches on title, boosting score for a matching year and country', () => {
  const details = { name: 'Breaking Bad', first_air_date: '2008-01-20', origin_country: ['US'] };
  const results = [{ show: { id: 1, name: 'Breaking Bad', premiered: '2008-01-20', network: { country: { code: 'us' } } } }];
  assert.deepEqual(pickBestTvmazeShowMatch(results, details), { match: results[0].show, reason: 'matched' });
});

test('pickBestTvmazeShowMatch normalizes titles case- and punctuation-insensitively', () => {
  const details = { name: 'breaking, bad' };
  const results = [{ show: { id: 2, name: 'Breaking Bad!' } }];
  assert.deepEqual(pickBestTvmazeShowMatch(results, details), { match: results[0].show, reason: 'matched' });
});

test('pickBestTvmazeShowMatch also matches against original_name', () => {
  const details = { name: 'English Title', original_name: 'Original Title' };
  const results = [{ show: { id: 3, name: 'Original Title' } }];
  assert.deepEqual(pickBestTvmazeShowMatch(results, details), { match: results[0].show, reason: 'matched' });
});

test('pickBestTvmazeShowMatch drops candidates with no show.id or a non-matching title', () => {
  assert.deepEqual(
    pickBestTvmazeShowMatch([{ show: { name: 'Breaking Bad' } }], { name: 'Breaking Bad' }),
    { match: null, reason: 'no-exact-title-match' },
  );
  assert.deepEqual(
    pickBestTvmazeShowMatch([{ show: { id: 5, name: 'Totally Different Show' } }], { name: 'Breaking Bad' }),
    { match: null, reason: 'no-exact-title-match' },
  );
});

test('pickBestTvmazeShowMatch picks the higher-scoring candidate among same-title matches', () => {
  const details = { name: 'Show X', first_air_date: '2008-01-20', origin_country: ['US'] };
  const results = [
    { show: { id: 10, name: 'Show X' } },
    { show: { id: 11, name: 'Show X', premiered: '2008-05-01', network: { country: { code: 'US' } } } },
  ];
  assert.deepEqual(pickBestTvmazeShowMatch(results, details), { match: results[1].show, reason: 'matched' });
});

test('pickBestTvmazeShowMatch reports ambiguous-match when two different shows tie on score, year, and country', () => {
  const details = { name: 'Show Y' };
  const results = [{ show: { id: 20, name: 'Show Y' } }, { show: { id: 21, name: 'Show Y' } }];
  assert.deepEqual(pickBestTvmazeShowMatch(results, details), { match: null, reason: 'ambiguous-match' });
});

test('pickBestTvmazeShowMatch is not ambiguous when a same-title peer has a different score', () => {
  const details = { name: 'Show Z', first_air_date: '2010-01-01', origin_country: ['GB'] };
  const results = [
    { show: { id: 30, name: 'Show Z' } },
    { show: { id: 31, name: 'Show Z', premiered: '2010-06-01', webChannel: { country: { code: 'gb' } } } },
  ];
  assert.deepEqual(pickBestTvmazeShowMatch(results, details), { match: results[1].show, reason: 'matched' });
});

test('pickBestTvmazeShowMatch only counts a year match when both sides have a year', () => {
  const details = { name: 'Show W' };
  const results = [{ show: { id: 40, name: 'Show W', premiered: '2015-01-01' } }];
  assert.deepEqual(pickBestTvmazeShowMatch(results, details), { match: results[0].show, reason: 'matched' });
});

test('pickBestTvmazeShowMatch reads the country code from webChannel when there is no network', () => {
  const details = { name: 'Show V', origin_country: ['GB'] };
  const results = [{ show: { id: 50, name: 'Show V', webChannel: { country: { code: 'gb' } } } }];
  assert.deepEqual(pickBestTvmazeShowMatch(results, details), { match: results[0].show, reason: 'matched' });
});
