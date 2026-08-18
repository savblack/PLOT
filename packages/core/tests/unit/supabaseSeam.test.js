import assert from 'node:assert/strict';
import test from 'node:test';

import { configure } from '../../config.js';
import { supabase } from '../../supabase.js';
import { createInMemorySupabase } from '../support/inMemorySupabase.js';

/* `config.supabaseClient` is the seam that makes core's data access reachable
 * from a test. These cases pin the two properties the rest of the suite leans
 * on, and one hazard the seam introduces.
 *
 * The hazard: the client is memoised, so it has to know when to rebuild. If it
 * keyed on the config *object*, any later configure() call — setting an
 * analytics seam, updating a URL — would silently mint a new client and drop
 * the signed-in user's auth session. It keys on the four inputs that decide
 * which client this actually is instead.
 */

test('an injected client is what core reaches through the supabase proxy', async () => {
  const injected = createInMemorySupabase({
    tables: { lists: [{ id: 'list-1', user_id: 'u1', name: 'My List' }] },
  });
  configure({ supabaseClient: injected });

  const { data } = await supabase.from('lists').select('id').eq('user_id', 'u1').maybeSingle();

  assert.deepEqual(data, { id: 'list-1', user_id: 'u1', name: 'My List' });
});

test('injecting a different client replaces the previous one', async () => {
  configure({ supabaseClient: createInMemorySupabase({ tables: { lists: [{ id: 'first' }] } }) });
  configure({ supabaseClient: createInMemorySupabase({ tables: { lists: [{ id: 'second' }] } }) });

  const { data } = await supabase.from('lists').select('id');

  assert.deepEqual(data.map(r => r.id), ['second']);
});

test('configure of an unrelated key does not swap the client out from under the app', async () => {
  // The regression that matters: rebuilding the client here would discard the
  // authenticated session in a running app.
  const injected = createInMemorySupabase({ tables: { lists: [{ id: 'keep-me' }] } });
  configure({ supabaseClient: injected });

  configure({ onWatchlistSave: () => {} });
  configure({ isDev: true });

  const { data } = await supabase.from('lists').select('id');

  assert.deepEqual(data.map(r => r.id), ['keep-me']);
});

test('the in-memory adapter reports an explicit error for a builder method core does not stub', async () => {
  // A test double that silently resolved undefined would turn a missing stub
  // into a passing test. It fails loudly instead.
  configure({ supabaseClient: createInMemorySupabase() });

  const { data, error } = await supabase.rpc('suggested_users');

  assert.equal(data, null);
  assert.match(error.message, /no stub for rpc/);
});
