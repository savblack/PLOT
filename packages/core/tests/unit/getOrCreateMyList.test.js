import assert from 'node:assert/strict';
import test from 'node:test';

import { configure } from '../../config.js';
import { getOrCreateMyListId } from '../../userMedia.js';
import { createInMemorySupabase } from '../support/inMemorySupabase.js';

/* getOrCreateMyListId reads "My List", creates it if absent, and recovers when
 * a concurrent flow (onboarding, the mobile lazy-create) wins the insert race.
 * `lists` carries a unique (user_id, name), so that race surfaces as 23505
 * rather than a duplicate list.
 *
 * None of this was reachable from a test until config.supabaseClient existed:
 * every module that touched the client imported the module-level singleton, so
 * the only assertable behaviour was the guard clauses that return *before* it.
 * The old test files said exactly that in their headers.
 *
 * The silent logger keeps expected-failure cases from printing to the test
 * output; the function reports through its return value, not the log.
 */

const QUIET = { warn() {}, error() {} };

function withClient(opts) {
  const client = createInMemorySupabase(opts);
  configure({ supabaseClient: client });
  return client;
}

test('getOrCreateMyListId returns the existing list without creating a second', async () => {
  const client = withClient({
    tables: { lists: [{ id: 'list-1', user_id: 'u1', name: 'My List' }] },
    unique: { lists: ['user_id', 'name'] },
  });

  assert.equal(await getOrCreateMyListId({ userId: 'u1' }), 'list-1');
  assert.equal(client.__db.tables.lists.length, 1);
});

test('getOrCreateMyListId creates the list when the user has none', async () => {
  const client = withClient({ tables: { lists: [] }, unique: { lists: ['user_id', 'name'] } });

  const id = await getOrCreateMyListId({ userId: 'u1' });

  assert.ok(id);
  assert.deepEqual(
    client.__db.tables.lists.map(r => [r.user_id, r.name, r.is_public]),
    [['u1', 'My List', false]],
  );
});

test("getOrCreateMyListId does not return another user's list", async () => {
  withClient({
    tables: { lists: [{ id: 'list-other', user_id: 'u2', name: 'My List' }] },
    unique: { lists: ['user_id', 'name'] },
  });

  const id = await getOrCreateMyListId({ userId: 'u1' });

  assert.notEqual(id, 'list-other');
});

test('getOrCreateMyListId recovers the winner when a concurrent flow wins the insert race', async () => {
  const client = withClient({ tables: { lists: [] }, unique: { lists: ['user_id', 'name'] } });

  // The first read finds nothing. Between it and the insert, another flow
  // (onboarding, the mobile lazy-create) commits the row — so the insert
  // collides on the unique (user_id, name) and Postgres returns 23505. That
  // overlap is the only reason the recovery branch exists.
  client.beforeNext('lists', 'insert', (db) => {
    db.tables.lists.push({ id: 'list-winner', user_id: 'u1', name: 'My List' });
  });

  const id = await getOrCreateMyListId({ userId: 'u1', logger: QUIET });

  assert.equal(id, 'list-winner');
  assert.equal(client.__db.tables.lists.length, 1, 'must not leave a duplicate list behind');
});

test('getOrCreateMyListId reports null when the re-read after a race also fails', async () => {
  const client = withClient({ tables: { lists: [] }, unique: { lists: ['user_id', 'name'] } });
  client.failNext('lists', 'insert', { code: '23505', message: 'duplicate key' });
  client.failNext('lists', 'select', { message: 'connection reset' });

  assert.equal(await getOrCreateMyListId({ userId: 'u1', logger: QUIET }), null);
});

test('getOrCreateMyListId reports null on a non-race insert failure rather than retrying', async () => {
  const client = withClient({ tables: { lists: [] }, unique: { lists: ['user_id', 'name'] } });
  client.failNext('lists', 'insert', { code: '42501', message: 'permission denied' });

  assert.equal(await getOrCreateMyListId({ userId: 'u1', logger: QUIET }), null);
});

test('getOrCreateMyListId reports null when the initial read fails', async () => {
  const client = withClient({ tables: { lists: [] }, unique: { lists: ['user_id', 'name'] } });
  client.failNext('lists', 'select', { message: 'connection reset' });

  assert.equal(await getOrCreateMyListId({ userId: 'u1', logger: QUIET }), null);
});

test('getOrCreateMyListId short-circuits without a userId', async () => {
  const client = withClient({ tables: { lists: [] } });

  assert.equal(await getOrCreateMyListId({ userId: null }), null);
  assert.equal(client.__db.tables.lists.length, 0);
});
