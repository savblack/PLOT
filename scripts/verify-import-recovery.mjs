import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { createClient } from '@supabase/supabase-js';
import { configure } from '../packages/core/config.js';
import { writeImportDocument } from '../packages/core/importPipeline.js';
// Only the approved private staging QA pilot is supported. Never supply production credentials.
if (!process.argv[2]) throw new Error('Usage: node scripts/verify-import-recovery.mjs <private-pilot-directory>');
const base = pathToFileURL(resolve(process.argv[2]) + '/');
const keys = JSON.parse(readFileSync(new URL('api-keys.json', base)));
const accounts = JSON.parse(readFileSync(new URL('accounts.json', base)));
const resolved = JSON.parse(readFileSync(new URL('resolved.json', base)));
assert.equal(accounts.length, 2, 'Expected the two approved synthetic QA accounts');
assert.ok(accounts.every(account => /^plot-import-qa-.*@example\.invalid$/.test(account.email)), 'Only synthetic import QA accounts are allowed');
const key = keys.find(k => k.type === 'publishable').api_key;
async function connect(account) {
  const client = createClient('https://uzrhfivnhdcfieuaxzip.supabase.co', key, { auth: { persistSession: false, autoRefreshToken: false } });
  const { error } = await client.auth.signInWithPassword({ email: account.email, password: account.password });
  assert.equal(error, null, 'QA sign-in must succeed');
  return client;
}
const owner = await connect(accounts[0]);
// Synthetic rewatches use captured TMDB metadata and a distinct, stable QA file identity.
const rows = Array.from({ length: 101 }, (_, index) => ({ ...resolved[index % resolved.length],
  eventId: undefined, account: 'qa-recovery-20260923', fileDigest: '9'.repeat(64), recordIndex: index,
  duplicateDecision: 'keep', knownEvents: [], duplicateCandidates: [], pendingDuplicates: [],
}));
let requests = 0;
configure({ importEventsEnabled: true, importAnnotationsEnabled: true, supabaseClient: {
  rpc: async (name, args) => {
    requests++;
    if (requests > 1) throw new Error('Simulated connection loss before request');
    const result = await owner.rpc(name, args);
    assert.equal(result.error, null, 'First batch must commit before its response is lost');
    throw new Error('Simulated response loss after commit');
  },
} });
const first = await writeImportDocument({ userId: accounts[0].id, resolved: rows, summaryRows: [] });
assert.deepEqual(first, { inserted: 0, failed: 101, duplicates: 0 });
const read = async client => {
  const result = await client.from('watch_events').select('source_key,watched_at,watched_on,season_number,episode_number')
    .eq('user_id', accounts[0].id).eq('source_account', 'qa-recovery-20260923');
  assert.equal(result.error, null);
  return result.data;
};
const initial = await read(owner);
assert.ok([50, 101].includes(initial.length), 'First run commits 50; reruns retain all 101');
console.log('PASS response loss reports unconfirmed rows without claiming saved counts');
// New auth/client instance models process restart; no in-memory progress is reused.
const restarted = await connect(accounts[0]);
configure({ supabaseClient: restarted });
const retry = await writeImportDocument({ userId: accounts[0].id, resolved: rows, summaryRows: [] });
assert.equal(retry.failed, 0);
assert.equal(retry.inserted, 101 - initial.length);
assert.equal(retry.duplicates, initial.length);
const saved = await read(restarted);
assert.equal(saved.length, 101);
assert.equal(new Set(saved.map(row => row.source_key)).size, 101);
assert.ok(saved.every(row => row.watched_at === null && row.watched_on === null));
assert.ok(saved.some(row => row.season_number === 2 && row.episode_number === 13));
console.log('PASS fresh-session retry preserves all 101 individual watches with no duplicates or invented dates');
const again = await writeImportDocument({ userId: accounts[0].id, resolved: rows, summaryRows: [] });
assert.deepEqual(again, { inserted: 0, failed: 0, duplicates: 101 });
const other = await connect(accounts[1]);
assert.deepEqual(await read(other), []);
console.log('PASS subsequent retry is idempotent and second QA account cannot read the records');
for (const client of [owner, restarted, other]) client.auth.stopAutoRefresh();
