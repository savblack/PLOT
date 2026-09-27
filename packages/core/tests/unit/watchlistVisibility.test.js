import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  WATCHLIST_VISIBILITIES, effectiveWatchlistVisibility, watchlistVisibilityOptions,
} from '../../watchlistVisibility.js';
import { PROFILE_PRIVACY } from '../../copy/profilePrivacy.js';

const MIGRATION = join(dirname(fileURLToPath(import.meta.url)),
  '../../../../supabase/migrations/20260927150000_watchlist_visibility.sql');

test('unset follows the profile: public is everyone, private is only me', () => {
  assert.equal(effectiveWatchlistVisibility({ is_public: true, watchlist_visibility: null }), 'everyone');
  assert.equal(effectiveWatchlistVisibility({ is_public: false, watchlist_visibility: null }), 'private');
  assert.equal(effectiveWatchlistVisibility(null), 'private');
});

test('everyone on a private profile means only me, so going private never leaves it open', () => {
  assert.equal(effectiveWatchlistVisibility({ is_public: false, watchlist_visibility: 'everyone' }), 'private');
  assert.equal(effectiveWatchlistVisibility({ is_public: true, watchlist_visibility: 'everyone' }), 'everyone');
});

test('an explicit narrower choice holds whether the profile is public or private', () => {
  for (const is_public of [true, false]) {
    for (const v of ['followers', 'selected', 'private']) {
      assert.equal(effectiveWatchlistVisibility({ is_public, watchlist_visibility: v }), v);
    }
  }
});

test('an unknown stored value falls back to the default rather than widening', () => {
  assert.equal(effectiveWatchlistVisibility({ is_public: false, watchlist_visibility: 'anyone' }), 'private');
});

test('a private profile is never offered everyone', () => {
  assert.deepEqual(watchlistVisibilityOptions(true), ['everyone', 'followers', 'selected', 'private']);
  assert.deepEqual(watchlistVisibilityOptions(false), ['followers', 'selected', 'private']);
});

test('every choice has a label and a hint', () => {
  for (const v of WATCHLIST_VISIBILITIES) {
    assert.ok(PROFILE_PRIVACY.watchlist.option[v], `label for ${v}`);
    assert.ok(PROFILE_PRIVACY.watchlist.hint[v], `hint for ${v}`);
  }
});

test('the values match the database check constraint and rule', () => {
  const sql = readFileSync(MIGRATION, 'utf8');
  const check = sql.match(/check \(watchlist_visibility in \(([^)]*)\)\)/);
  assert.ok(check, 'check constraint found');
  const values = check[1].split(',').map(s => s.trim().replace(/'/g, ''));
  assert.deepEqual(values, [...WATCHLIST_VISIBILITIES]);
  // The SQL default mirrors effectiveWatchlistVisibility.
  assert.match(sql, /when p\.watchlist_visibility is null then case when coalesce\(p\.is_public, false\) then 'everyone' else 'private' end/);
  assert.match(sql, /when p\.watchlist_visibility = 'everyone' and not coalesce\(p\.is_public, false\) then 'private'/);
});
