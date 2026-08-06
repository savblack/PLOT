import assert from 'node:assert/strict';
import test from 'node:test';

import { getOrCreateMyListId, saveOnboardingSeedTitles } from '../../onboarding.js';

function makeLogger() {
  const warnings = [];
  return { warnings, warn: (...args) => warnings.push(args) };
}

function makeSupabase({ maybeSingleResults = [], singleResults = [] } = {}) {
  const calls = { selects: [], inserts: [] };
  let maybeSingleIndex = 0;
  let singleIndex = 0;

  return {
    calls,
    from(table) {
      assert.equal(table, 'lists');

      return {
        select(fields) {
          assert.equal(fields, 'id');
          const filters = {};

          return {
            eq(column, value) {
              filters[column] = value;
              return this;
            },
            async maybeSingle() {
              calls.selects.push({ type: 'maybeSingle', filters: { ...filters } });
              return maybeSingleResults[maybeSingleIndex++] ?? { data: null, error: null };
            },
            async single() {
              calls.selects.push({ type: 'single', filters: { ...filters } });
              return singleResults[singleIndex++] ?? { data: null, error: null };
            },
          };
        },
        insert(payload) {
          calls.inserts.push(payload);

          return {
            select(fields) {
              assert.equal(fields, 'id');
              return {
                async single() {
                  return singleResults[singleIndex++] ?? { data: null, error: null };
                },
              };
            },
          };
        },
      };
    },
  };
}

test('getOrCreateMyListId returns null without a supabase client or a userId', async () => {
  assert.equal(await getOrCreateMyListId({ supabase: null, userId: 'u1' }), null);
  assert.equal(await getOrCreateMyListId({ supabase: {}, userId: null }), null);
});

test('getOrCreateMyListId returns an existing list id without inserting', async () => {
  const supabase = makeSupabase({
    maybeSingleResults: [{ data: { id: 'list-existing' }, error: null }],
  });

  const listId = await getOrCreateMyListId({ supabase, userId: 'user-1' });

  assert.equal(listId, 'list-existing');
  assert.equal(supabase.calls.inserts.length, 0);
  assert.deepEqual(supabase.calls.selects, [
    { type: 'maybeSingle', filters: { user_id: 'user-1', name: 'My List' } },
  ]);
});

test('getOrCreateMyListId creates the list when none exists yet', async () => {
  const supabase = makeSupabase({
    maybeSingleResults: [{ data: null, error: null }],
    singleResults: [{ data: { id: 'list-new' }, error: null }],
  });

  const listId = await getOrCreateMyListId({ supabase, userId: 'user-1' });

  assert.equal(listId, 'list-new');
  assert.deepEqual(supabase.calls.inserts, [{ user_id: 'user-1', name: 'My List', is_public: false }]);
});

test('getOrCreateMyListId logs and returns null when the initial read errors', async () => {
  const logger = makeLogger();
  const supabase = makeSupabase({
    maybeSingleResults: [{ data: null, error: { message: 'read boom' } }],
  });

  const listId = await getOrCreateMyListId({ supabase, userId: 'user-1', logger });

  assert.equal(listId, null);
  assert.equal(supabase.calls.inserts.length, 0);
  assert.equal(logger.warnings.length, 1);
});

test('getOrCreateMyListId logs and returns null when insert fails with a non-duplicate error', async () => {
  const logger = makeLogger();
  const supabase = makeSupabase({
    maybeSingleResults: [{ data: null, error: null }],
    singleResults: [{ data: null, error: { code: '99999', message: 'insert boom' } }],
  });

  const listId = await getOrCreateMyListId({ supabase, userId: 'user-1', logger });

  assert.equal(listId, null);
  assert.equal(logger.warnings.length, 1);
});

test('getOrCreateMyListId refetches the list when insert loses a race', async () => {
  const supabase = makeSupabase({
    maybeSingleResults: [
      { data: null, error: null },
      { data: { id: 'list-raced' }, error: null },
    ],
    singleResults: [
      { data: null, error: { code: '23505', message: 'duplicate key value violates unique constraint' } },
    ],
  });

  const listId = await getOrCreateMyListId({ supabase, userId: 'user-2' });

  assert.equal(listId, 'list-raced');
  assert.deepEqual(supabase.calls.inserts, [{ user_id: 'user-2', name: 'My List', is_public: false }]);
  assert.equal(supabase.calls.selects.length, 2, 'initial lookup + refetch after duplicate create');
});

test('getOrCreateMyListId logs and returns null when the post-duplicate refetch also errors', async () => {
  const logger = makeLogger();
  const supabase = makeSupabase({
    maybeSingleResults: [
      { data: null, error: null },
      { data: null, error: { message: 'refetch boom' } },
    ],
    singleResults: [{ data: null, error: { code: '23505' } }],
  });

  const listId = await getOrCreateMyListId({ supabase, userId: 'user-2', logger });

  assert.equal(listId, null);
  assert.equal(logger.warnings.length, 1);
});

test('saveOnboardingSeedTitles short-circuits to 0 without a client, a userId, or a non-empty items array', async () => {
  assert.equal(await saveOnboardingSeedTitles({ supabase: null, userId: 'u1', items: [{ id: 1 }] }), 0);
  assert.equal(await saveOnboardingSeedTitles({ supabase: {}, userId: null, items: [{ id: 1 }] }), 0);
  assert.equal(await saveOnboardingSeedTitles({ supabase: {}, userId: 'u1', items: 'not-an-array' }), 0);
  assert.equal(await saveOnboardingSeedTitles({ supabase: {}, userId: 'u1', items: [] }), 0);
});

test('saveOnboardingSeedTitles returns 0 and never calls saveItem when the list cannot be resolved', async () => {
  const supabase = makeSupabase({ maybeSingleResults: [{ data: null, error: { message: 'fail' } }] });
  let saveItemCalled = false;

  const saved = await saveOnboardingSeedTitles({
    supabase,
    userId: 'user-1',
    items: [{ id: 1, title: 'One' }],
    saveItem: async () => { saveItemCalled = true; return { error: null }; },
    logger: makeLogger(),
  });

  assert.equal(saved, 0);
  assert.equal(saveItemCalled, false);
});

test('saveOnboardingSeedTitles saves each selected title into the resolved list', async () => {
  const supabase = makeSupabase({
    maybeSingleResults: [{ data: null, error: null }],
    singleResults: [{ data: { id: 'list-new' }, error: null }],
  });
  const saveCalls = [];

  const saved = await saveOnboardingSeedTitles({
    supabase,
    userId: 'user-3',
    items: [{ id: 1, title: 'One' }, { id: 2, title: 'Two' }],
    saveItem: async (args) => {
      saveCalls.push(args);
      return { error: args.item.id === 2 ? { code: '23505' } : null };
    },
  });

  assert.equal(saved, 2, 'duplicate seed items are treated as already-saved success');
  assert.deepEqual(saveCalls, [
    { listId: 'list-new', userId: 'user-3', item: { id: 1, title: 'One' } },
    { listId: 'list-new', userId: 'user-3', item: { id: 2, title: 'Two' } },
  ]);
});

test('saveOnboardingSeedTitles counts a genuine (non-duplicate) save error as not saved, logs it, and still processes the rest', async () => {
  const supabase = makeSupabase({ maybeSingleResults: [{ data: { id: 'list-1' }, error: null }] });
  const logger = makeLogger();
  const saveCalls = [];

  const saved = await saveOnboardingSeedTitles({
    supabase,
    userId: 'user-4',
    items: [{ id: 1 }, { id: 2 }, { id: 3 }],
    saveItem: async (args) => {
      saveCalls.push(args.item.id);
      if (args.item.id === 2) return { error: { code: 'other-error' } };
      if (args.item.id === 3) return { error: { code: '23505' } };
      return { error: null };
    },
    logger,
  });

  assert.equal(saved, 2);
  assert.deepEqual(saveCalls, [1, 2, 3]);
  assert.equal(logger.warnings.length, 1);
});
