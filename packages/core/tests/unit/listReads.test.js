import test from 'node:test';
import assert from 'node:assert/strict';
import { configure } from '../../config.js';
import { readListItems } from '../../listReads.js';
import { createInMemorySupabase } from '../support/inMemorySupabase.js';
test('large imported lists remain visible, with owner and list isolation', async () => {
  const own = Array.from({ length:2101 },(_,i) => ({ id:String(i),user_id:'owner',list_id:'list' }));
  const client = createInMemorySupabase({ tables: { list_items:[...own,{id:'other',user_id:'other',list_id:'list'},{id:'other-list',user_id:'owner',list_id:'another'}] } });
  configure({ supabaseClient:client });
  assert.equal((await readListItems({userId:'owner',listId:'list'})).length,2101);
  client.beforeNext('list_items','select',() => client.beforeNext('list_items','select', () => client.failNext('list_items','select',{message:'offline'})));
  await assert.rejects(readListItems({userId:'owner',listId:'list'}));
});
