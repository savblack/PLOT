// Staging-only IMDb mixed-watchlist proof using existing synthetic QA accounts.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { createClient } from '@supabase/supabase-js';
import { configure } from '../packages/core/config.js';
import { prepareImportFiles } from '../packages/core/importDocument.js';
import { resolveImportEntries, writeImportDocument } from '../packages/core/importPipeline.js';
import { tmdb } from '../packages/core/tmdb.js';

assert.ok(process.argv[2], 'Supply the private pilot directory');
const ratings = process.argv[3] === '--tv-ratings';
assert.ok(!process.argv[3] || ratings, 'Unknown verification mode');
const privateFile = name => JSON.parse(readFileSync(resolve(process.argv[2], name)));
const accounts = privateFile('accounts.json');
assert.equal(accounts.length, 2);
assert.ok(accounts.every(a => /^plot-import-qa-.*@example\.invalid$/.test(a.email)));
const key = privateFile('api-keys.json').find(k => k.type === 'publishable').api_key;
const url = 'https://uzrhfivnhdcfieuaxzip.supabase.co';
async function signIn(account) {
  const client = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
  const { data, error } = await client.auth.signInWithPassword({ email: account.email, password: account.password });
  assert.equal(error, null, 'Synthetic QA login failed');
  assert.equal(data.user.id, account.id);
  return client;
}
const owner = await signIn(accounts[0]);
const other = await signIn(accounts[1]);
configure({ supabaseUrl: url, supabaseAnonKey: key, supabaseClient: owner,
  tmdbProxyUrl: 'https://tmdb-proxy-staging.sav-black.workers.dev', importEventsEnabled: true, importAnnotationsEnabled: true });
async function snapshot(table, client = owner) {
  const { data, error } = await client.from(table).select('*').eq('user_id', accounts[0].id).limit(1000);
  assert.equal(error, null);
  assert.ok(data.length < 1000, 'Snapshot must not be truncated');
  return data.sort((a,b) => JSON.stringify(a).localeCompare(JSON.stringify(b)));
}
try {
  const before = { history: await snapshot('history'), events: await snapshot('watch_events') };
  const text = readFileSync(new URL(`../packages/core/tests/fixtures/imports/${ratings ? 'imdb-tv-ratings.csv' : 'imdb-mixed-watchlist.csv'}`, import.meta.url), 'utf8');
  const document = prepareImportFiles('imdb', [{ name: ratings ? 'ratings.csv' : 'watchlist.csv', text }]);
  const resolved = await resolveImportEntries(document.entries, { search: title => tmdb.search(title), findByImdbId: id => tmdb.findByImdbId(id) });
  assert.equal(resolved.length, ratings ? 2 : 4);
  assert.ok(resolved.every(row => row.status === 'matched'));
  assert.deepEqual(resolved.map(row => row.mediaType), ratings ? ['tv','tv'] : ['movie','tv','tv','movie']);
  const first = await writeImportDocument({ userId: accounts[0].id, resolved });
  assert.equal(first.failed, 0);
  const replay = await writeImportDocument({ userId: accounts[0].id, resolved });
  assert.equal(replay.failed, 0);
  assert.equal(replay.inserted, 0);
  assert.equal(replay.duplicates, resolved.length);
  if (ratings) {
    const saved = await snapshot('imported_annotations');
    for (const row of resolved) assert.ok(saved.some(item => item.tmdb_id === row.tmdbId && item.source === 'imdb'
      && item.annotation_scope === 'show' && item.annotation.rating === 7 && item.annotation.ratedAt === '2024-01-15'));
    assert.deepEqual(await snapshot('imported_annotations', other), [], 'Cross-account annotations must stay private');
  } else {
    const destinations = await snapshot('lists');
    const watchlist = destinations.find(row => row.name === '__watchlist__');
    assert.ok(watchlist, 'Watchlist destination is required');
    const saved = (await snapshot('list_items')).filter(row => row.list_id === watchlist.id);
    for (const row of resolved) assert.ok(saved.some(item => item.tmdb_id === row.tmdbId && item.media_type === row.mediaType));
  }
  assert.deepEqual(await snapshot('history'), before.history, 'Watchlist must not change watch summaries');
  assert.deepEqual(await snapshot('watch_events'), before.events, 'Watchlist must not create watch events');
  assert.deepEqual(await snapshot('imported_list_entries', other), [], 'Cross-account provenance must stay private');
  console.log(`PASS ${resolved.length} IMDb ${ratings ? 'TV ratings' : 'movie/series watchlist entries'}, live ID resolution, safe replay, unchanged history and cross-account isolation`);
} finally {
  await owner.auth.signOut({ scope: 'local' });
  await other.auth.signOut({ scope: 'local' });
}
