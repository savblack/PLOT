import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync, readdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

import { configure } from '../../config.js';
import {
  classifyFailure, reportActionFailure, reportLoadFailure, historyFailureAction, FAILED_ACTIONS, FAILED_LOADS,
} from '../../actionFailures.js';
import { updateProfile } from '../../profile.js';
import { createInMemorySupabase } from '../support/inMemorySupabase.js';

function capture() {
  const events = [];
  configure({ onActionFailed: (payload) => events.push(payload) });
  return events;
}

/* ── classifyFailure ── */

test('classifyFailure buckets the codes that matter', () => {
  assert.equal(classifyFailure({ code: '42P10', message: 'no unique constraint matching ON CONFLICT' }), 'schema');
  assert.equal(classifyFailure({ code: '42703', message: 'column does not exist' }), 'schema');
  assert.equal(classifyFailure({ code: '42501', message: 'new row violates row-level security' }), 'permission');
  assert.equal(classifyFailure({ code: '23505', message: 'duplicate key' }), 'conflict');
  assert.equal(classifyFailure({ code: '23503', message: 'foreign key' }), 'constraint');
  assert.equal(classifyFailure({ code: 'PGRST116', message: 'no rows' }), 'not_found');
  assert.equal(classifyFailure({ code: 'PGRST301', message: 'JWT expired' }), 'auth');
  assert.equal(classifyFailure({ code: '57014', message: 'statement timeout' }), 'timeout');
  assert.equal(classifyFailure({ code: 'P0001', message: 'raised' }), 'server');
  assert.equal(classifyFailure({ status: 503, message: 'unavailable' }), 'server');
});

test('classifyFailure recognises a failed fetch as network', () => {
  assert.equal(classifyFailure({ message: 'TypeError: Failed to fetch', code: '' }), 'network');
  assert.equal(classifyFailure({ message: 'Network request failed' }), 'network');
});

test('classifyFailure treats no error and no row as its own kind', () => {
  // An update RLS narrows to zero rows returns exactly this.
  assert.equal(classifyFailure(null), 'no_data');
  assert.equal(classifyFailure({ message: 'something odd' }), 'unknown');
});

/* ── reportActionFailure ── */

test('reportActionFailure sends the code and kind but never the message', () => {
  const events = capture();
  reportActionFailure(FAILED_ACTIONS.WATCHLIST_SAVE, {
    code: '23505',
    status: 409,
    message: 'duplicate key value violates unique constraint',
    details: 'Key (list_id, tmdb_id)=(abc, 27205) already exists.',
    hint: null,
  }, { tmdb_id: 27205, media_type: 'movie' });

  assert.deepEqual(events, [{
    action: 'watchlist_save',
    error_kind: 'conflict',
    error_code: '23505',
    http_status: 409,
    tmdb_id: 27205,
    media_type: 'movie',
  }]);
  assert.ok(!JSON.stringify(events).includes('already exists'));
});

test('reportActionFailure drops a code that is not a SQLSTATE or PostgREST code', () => {
  const events = capture();
  reportActionFailure(FAILED_ACTIONS.REPORT, { code: 'user typed this', message: 'x' });
  assert.equal(events[0].error_code, undefined);
});

test('reportActionFailure lets a caller name the kind for a failure that never reached the server', () => {
  const events = capture();
  reportActionFailure(FAILED_ACTIONS.WATCH_PROGRESS, null, { tmdb_id: 1, kind: 'client_state' });
  assert.equal(events[0].error_kind, 'client_state');
  assert.equal('kind' in events[0], false);
});

test('onboarding seed failures carry their source without exposing error detail', () => {
  const events = capture();
  reportActionFailure(FAILED_ACTIONS.WATCHLIST_SAVE, { code: '42501', message: 'private row value' }, { source: 'onboarding' });
  assert.deepEqual(events, [{ action: 'watchlist_save', error_kind: 'permission', error_code: '42501', source: 'onboarding' }]);
});

test('reportActionFailure never throws, even when the seam does', () => {
  configure({ onActionFailed: () => { throw new Error('posthog exploded'); } });
  assert.doesNotThrow(() => reportActionFailure(FAILED_ACTIONS.FOLLOW, { code: '42501' }));
  configure({ onActionFailed: undefined });
  assert.doesNotThrow(() => reportActionFailure(FAILED_ACTIONS.FOLLOW, { code: '42501' }));
});

/* ── historyFailureAction ── */

test('historyFailureAction separates a star tap, a write-up, a clear and a plain watch', () => {
  assert.equal(historyFailureAction({ rating: 8 }), 'rating_set');
  assert.equal(historyFailureAction({ rating: 8, note: 'Loved it', dnf: false }), 'review_save');
  assert.equal(historyFailureAction({ rating: null, note: null }), 'review_clear');
  assert.equal(historyFailureAction({ watched_at: '2026-09-01' }), 'history_update');

  assert.equal(historyFailureAction({ rating: undefined, note: undefined }, { logging: true }), 'mark_watched');
  assert.equal(historyFailureAction({ rating: 6, note: undefined }, { logging: true }), 'rating_set');
  // TitleReview sends note: null for an empty write-up; logging it is still a review.
  assert.equal(historyFailureAction({ rating: null, note: null }, { logging: true }), 'review_save');
});

/* ── Wiring ── */

test('a failed profile write reports profile_update with field names only', async () => {
  const client = createInMemorySupabase({ tables: { profiles: [{ id: 'u1' }] } });
  configure({ supabaseClient: client });
  const events = capture();
  client.failNext('profiles', 'update', { code: '23505', message: 'duplicate key' });

  await updateProfile({ userId: 'u1', patch: { username: 'taken' } });

  assert.deepEqual(events, [{
    action: 'profile_update', error_kind: 'conflict', error_code: '23505', fields: ['username'],
  }]);
});

test('every core module with a success seam also reports failures', () => {
  // The success seams fire from the one canonical site per action; a module
  // that gains one without failure reporting is the gap this event closes.
  const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
  const missing = readdirSync(root)
    .filter(name => name.endsWith('.js') && name !== 'config.js' && name !== 'actionFailures.js')
    .filter(name => {
      const source = readFileSync(join(root, name), 'utf8');
      // Reads report through load_failed and imports through import_failed,
      // so either of those counts as failure reporting too.
      return /getConfig\(\)\.on(?!ActionFailed|LoadFailed)[A-Z]\w*\?\.\(/.test(source)
        && !/reportActionFailure\(|reportLoadFailure\(|reportImport\('failed'/.test(source);
    });
  assert.deepEqual(missing, []);
});

/* ── Follow-ups: shared follow writes, bulk clear, load failures ── */

test('followUser fires user_followed on success and action_failed on failure, never both', async () => {
  const { followUser, unfollowUser } = await import('../../useFollows.js');
  const client = createInMemorySupabase({ tables: { follows: [] } });
  const follows = [];
  const failures = [];
  configure({
    supabaseClient: client,
    onFollow: (p) => follows.push(p),
    onActionFailed: (p) => failures.push(p),
  });

  const ok = await followUser({ viewerId: 'u1', targetId: 'u2' });
  assert.equal(ok.ok, true);
  assert.deepEqual(follows, [{ target_user_id: 'u2', following: true }]);

  client.failNext('follows', 'insert', { code: '42501', message: 'rls' });
  const denied = await followUser({ viewerId: 'u1', targetId: 'u3' });
  assert.deepEqual(denied, { ok: false, status: null });
  assert.equal(follows.length, 1);
  assert.deepEqual(failures, [{ action: 'follow', error_kind: 'permission', error_code: '42501' }]);

  client.failNext('follows', 'delete', { message: 'TypeError: Failed to fetch' });
  assert.equal(await unfollowUser({ viewerId: 'u1', targetId: 'u2' }), false);
  assert.equal(failures[1].action, 'unfollow');
  assert.equal(failures[1].error_kind, 'network');
  configure({ onFollow: undefined });
});

test('clearSavedAndWatching reports a failed clear instead of passing it off as success', async () => {
  const { clearSavedAndWatching } = await import('../../userMedia.js');
  const client = createInMemorySupabase({ tables: {
    lists: [{ id: 'l1', user_id: 'u1', name: 'My List' }],
    list_items: [{ id: 'i1', list_id: 'l1', tmdb_id: 1 }],
    watching_progress: [{ id: 'w1', user_id: 'u1', tmdb_id: 2 }],
  } });
  configure({ supabaseClient: client });
  const events = capture();

  client.failNext('watching_progress', 'delete', { code: '57014', message: 'timeout' });
  const failed = await clearSavedAndWatching({ userId: 'u1', saved: true, watching: true });
  assert.equal(failed.error.code, '57014');
  assert.deepEqual(events, [{
    action: 'watchlist_clear', error_kind: 'timeout', error_code: '57014', fields: ['saved', 'watching'],
  }]);

  const cleared = await clearSavedAndWatching({ userId: 'u1', saved: true, watching: true });
  assert.equal(cleared.error, null);
  assert.equal(client.__db.tables.list_items.length, 0);
  assert.equal(client.__db.tables.watching_progress.length, 0);
  assert.equal(events.length, 1);
});

test('reportLoadFailure uses its own seam, so a failed read never counts as a failed action', () => {
  const actions = capture();
  const loads = [];
  configure({ onLoadFailed: (p) => loads.push(p) });

  reportLoadFailure(FAILED_LOADS.HISTORY, { code: 'PGRST301', message: 'JWT expired', details: 'secret' });
  reportLoadFailure(FAILED_LOADS.ONBOARDING_SERVICES, null);

  assert.deepEqual(actions, []);
  assert.deepEqual(loads, [
    { resource: 'history', error_kind: 'auth', error_code: 'PGRST301' },
    { resource: 'onboarding_services', error_kind: 'no_data' },
  ]);
  configure({ onLoadFailed: () => { throw new Error('boom'); } });
  assert.doesNotThrow(() => reportLoadFailure(FAILED_LOADS.WATCHING, null));
  configure({ onLoadFailed: undefined });
});
