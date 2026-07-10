import assert from 'node:assert/strict';
import test from 'node:test';

import { getOrCreateMyListId, saveOnboardingSeedTitles } from '../../src/core/onboarding.js';

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

test('getOrCreateMyListId returns an existing list id without inserting', async () => {
  const supabase = makeSupabase({
    maybeSingleResults: [{ data: { id: 'list-existing' }, error: null }],
  });

  const listId = await getOrCreateMyListId({ supabase, userId: 'user-1' });

  assert.equal(listId, 'list-existing');
  assert.equal(supabase.calls.inserts.length, 0);
  assert.deepEqual(supabase.calls.selects, [
    {
      type: 'maybeSingle',
      filters: { user_id: 'user-1', name: 'My List' },
    },
  ]);
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
  assert.deepEqual(supabase.calls.inserts, [
    { user_id: 'user-2', name: 'My List', is_public: false },
  ]);
  assert.equal(supabase.calls.selects.length, 2, 'initial lookup + refetch after duplicate create');
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
