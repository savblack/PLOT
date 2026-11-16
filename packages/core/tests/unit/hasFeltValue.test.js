import assert from 'node:assert/strict';
import test from 'node:test';
import { feltValueSuppressionReason, hasFeltValue, quickAddCountAfterAdd, quickAddProgress, uniqueLibraryTitleCount } from '../../hasFeltValue.js';
import { accountSessionCountForUser, recordAccountSession, shouldStartAccountSession } from '../../accountSession.js';

const ready = rows => ({ items: rows, entries: rows, loading: false, error: false, loadError: false });
const title = (tmdb_id, media_type = 'movie') => ({ tmdb_id, media_type });

test('value is either five unique titles or a second server session, and unknown fails closed', () => {
  assert.equal(hasFeltValue({ titleCount: 5, sessionCount: null }), true);
  assert.equal(hasFeltValue({ titleCount: null, sessionCount: 2 }), true);
  assert.equal(hasFeltValue({ titleCount: 4, sessionCount: 1 }), false);
  assert.equal(hasFeltValue({ titleCount: null, sessionCount: null }), false);
  assert.equal(hasFeltValue({ titleCount: '5', sessionCount: '2' }), false);
});

test('unique count deduplicates lists and repeated history by media type plus TMDB ID', () => {
  const count = uniqueLibraryTitleCount({
    watchlist: ready([title(1), title(2), title(3)]),
    watching: ready([title(3, 'tv'), title(4, 'tv')]),
    history: ready([title(1), title(3, 'tv'), title(4, 'tv'), title(5)]),
  });
  assert.equal(count, 6);
  assert.equal(uniqueLibraryTitleCount({ watchlist: ready([]), watching: ready([]), history: { ...ready([]), loading: true } }), null);
  assert.equal(uniqueLibraryTitleCount({ watchlist: { ...ready([]), error: 'failed' }, watching: ready([]), history: ready([]) }), null);
});

test('quick add progress and suppression reason', () => {
  assert.equal(quickAddProgress(2), 2);
  assert.equal(quickAddProgress(8), 5);
  assert.equal(quickAddCountAfterAdd(4, false), 5);
  assert.equal(quickAddCountAfterAdd(4, true), 4);
  assert.equal(feltValueSuppressionReason('onboarding'), 'first_session');
  assert.equal(feltValueSuppressionReason('fifth_title'), 'titles_lt_5');
  assert.equal(feltValueSuppressionReason('trakt_import'), 'titles_lt_5');
});

test('session recording asks the server and fails closed when its column or RPC is unavailable', async () => {
  let args;
  const client = { rpc: async (name, input) => { args = [name, input]; return { data: 2, error: null }; } };
  assert.equal(await recordAccountSession('account', 'America/New_York', { client }), 2);
  assert.deepEqual(args, ['record_account_session', { p_timezone: 'America/New_York' }]);
  assert.equal(await recordAccountSession(null, 'UTC', { client }), null);
  assert.equal(await recordAccountSession('account', 'UTC', { client: { rpc: async () => ({ error: { code: '42883' } }) } }), null);
});

test('a missing session result cannot match an anonymous user ID', () => {
  assert.equal(accountSessionCountForUser(null, undefined), null);
  assert.equal(accountSessionCountForUser(null, null), null);
  assert.equal(accountSessionCountForUser({ userId: 'previous', count: 2 }, undefined), null);
  assert.equal(accountSessionCountForUser({ userId: 'previous', count: 2 }, 'current'), null);
  assert.equal(accountSessionCountForUser({ userId: 'current', count: 2 }, 'current'), 2);
});

test('session boundary matches the SQL 30-minute or new-local-day rule', () => {
  assert.equal(shouldStartAccountSession(null, '2026-11-16T00:00:00Z'), true);
  assert.equal(shouldStartAccountSession('2026-11-16T01:00:00Z', '2026-11-16T01:29:59Z'), false);
  assert.equal(shouldStartAccountSession('2026-11-16T01:00:00Z', '2026-11-16T01:30:00Z'), true);
  assert.equal(shouldStartAccountSession('2026-11-16T12:59:00Z', '2026-11-16T13:00:00Z', 'Australia/Sydney'), true);
  assert.equal(shouldStartAccountSession('2026-11-16T12:59:00Z', '2026-11-16T13:00:00Z', 'UTC'), false);
  assert.equal(shouldStartAccountSession('2026-11-16T12:59:00Z', '2026-11-16T13:00:00Z', 'unknown/timezone'), false);
});
