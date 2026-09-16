import test from 'node:test';
import assert from 'node:assert/strict';
import { configure } from '../../config.js';
import { createInMemorySupabase } from '../support/inMemorySupabase.js';
import { loadBroadcastPreferences, saveBroadcastPreferences, validateBroadcastPreferences } from '../../broadcastPreferences.js';
import { broadcastSnapshotUrl, validateGuideSnapshot } from '../../broadcastGuide.js';

test('new accounts have no guessed market and empty selections survive save/reload', async () => {
  const client = createInMemorySupabase({ unique: { broadcast_preferences: ['user_id'] } });
  configure({ supabaseClient: client, supabaseUrl: 'https://backend.example' });
  assert.deepEqual(await loadBroadcastPreferences('viewer'), { market_id: null, channel_ids: null });
  await saveBroadcastPreferences('viewer', { market_id: 'Sydney', channel_ids: [] });
  assert.deepEqual(await loadBroadcastPreferences('viewer'), { market_id: 'Sydney', channel_ids: [] });
  await saveBroadcastPreferences('viewer', { market_id: 'Perth', channel_ids: null });
  assert.deepEqual(await loadBroadcastPreferences('viewer'), { market_id: 'Perth', channel_ids: null });
  assert.deepEqual(await loadBroadcastPreferences('someone-else'), { market_id: null, channel_ids: null });
  assert.equal(broadcastSnapshotUrl('Perth'), 'https://backend.example/storage/v1/object/public/broadcast-guide/Perth.json');
});

test('read/write failures are errors and do not replace last saved preferences', async () => {
  const client = createInMemorySupabase({ tables: { broadcast_preferences: [{ user_id: 'viewer', market_id: 'Sydney', channel_ids: ['abc'] }] }, unique: { broadcast_preferences: ['user_id'] } });
  configure({ supabaseClient: client });
  client.failNext('broadcast_preferences', 'select', { message: 'offline' });
  await assert.rejects(loadBroadcastPreferences('viewer'));
  client.failNext('broadcast_preferences', 'upsert', { message: 'offline' });
  await assert.rejects(saveBroadcastPreferences('viewer', { market_id: 'Perth', channel_ids: [] }));
  assert.deepEqual(await loadBroadcastPreferences('viewer'), { market_id: 'Sydney', channel_ids: ['abc'] });
});

test('rejects unknown markets and malformed channel IDs instead of guessing', () => {
  for (const value of [{ market_id: 'unknown', channel_ids: null }, { market_id: 'Sydney', channel_ids: [123] }, { market_id: 'Sydney', channel_ids: [''] }]) {
    assert.throws(() => validateBroadcastPreferences(value));
  }
  assert.deepEqual(validateBroadcastPreferences({ market_id: 'Sydney', channel_ids: ['abc', 'abc'] }).channel_ids, ['abc']);
  assert.throws(() => broadcastSnapshotUrl('../private'));
  assert.throws(() => validateGuideSnapshot({ sourceUrl: 'javascript:alert(1)' }, 'Sydney'));
});
