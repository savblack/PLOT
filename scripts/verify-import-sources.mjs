// Staging-only persistence proof using the two already authorised synthetic QA accounts.
// Streaming transports are synthetic; they do not certify provider export schemas.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { createClient } from '@supabase/supabase-js';
import { configure } from '../packages/core/config.js';
import { prepareImportFiles } from '../packages/core/importDocument.js';
import { resolveImportEntries, chooseImportMatch, writeImportDocument } from '../packages/core/importPipeline.js';
import { tmdb } from '../packages/core/tmdb.js';

if (!process.argv[2]) throw Error('Usage: node scripts/verify-import-sources.mjs <private-pilot-directory>');
const privateFile = name => JSON.parse(readFileSync(resolve(process.argv[2], name)));
const accounts = privateFile('accounts.json');
assert.equal(accounts.length, 2);
assert.ok(accounts.every(a => /^plot-import-qa-.*@example\.invalid$/.test(a.email)));
const key = privateFile('api-keys.json').find(k => k.type === 'publishable').api_key;
const url = 'https://uzrhfivnhdcfieuaxzip.supabase.co';
const fixture = name => readFileSync(new URL(`../packages/core/tests/fixtures/imports/${name}`, import.meta.url), 'utf8');
const movie = JSON.parse(fixture('trakt-history.json'))[1].movie;
const netflixEpisodes = process.argv[3] === '--netflix-episodes';
const primePlayback = process.argv[3] === '--prime-playback';
assert.ok(!process.argv[3] || netflixEpisodes || primePlayback, 'Unknown verification mode');
const cases = primePlayback ? [['prime', 'PrimeVideo.ViewingHistory.csv', fixture('prime-viewing-history.csv')]] : netflixEpisodes ? [['netflix', 'NetflixViewingHistory.csv', fixture('netflix-viewing-history.csv')]] : [
  ['netflix', 'NetflixViewingHistory.csv', `Title,Date\n${movie.title},`],
  ['prime', 'history.csv', `Title,Date Watched\n${movie.title},`],
  ['disney', 'history.json', JSON.stringify([{ title: movie.title }])],
  ['max', 'history.json', JSON.stringify([{ title: movie.title }])],
  ['apple', 'history.json', JSON.stringify([{ Item_Description: movie.title }])],
  ['imdb', 'ratings.csv', fixture('imdb-movie-ratings.csv').split('\n').slice(0, 2).join('\n')],
  ['letterboxd', 'diary.csv', fixture('letterboxd-diary.csv')],
  ['trakt', 'watched-history.json', fixture('trakt-history.json')],
  ['tvtime', 'movies.json', JSON.stringify([{ title: movie.title, id: movie.ids, is_watched: true, watched_at: null, rating: null }])],
];
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
  tmdbProxyUrl: 'https://tmdb-proxy-staging.sav-black.workers.dev', importEventsEnabled: true,
  tvTimeImportEnabled: true, importAnnotationsEnabled: true });
const sourceAccount = primePlayback ? 'qa-prime-playback-20260923' : netflixEpisodes ? 'qa-netflix-episodes-20260923' : 'qa-source-matrix-20260923';
const summaries = async () => {
  const { data, error } = await owner.from('history').select('tmdb_id,media_type,rating,note,watched_at')
    .eq('user_id', accounts[0].id).order('tmdb_id').order('media_type').limit(1000);
  assert.equal(error, null);
  assert.ok(data.length < 1000, 'QA summary snapshot must not be truncated');
  return data;
};
const before = await summaries();
const read = async client => {
  const { data, error } = await client.from('watch_events').select('source_key,source,watched_on,watched_at,date_precision,season_number,episode_number')
    .eq('user_id', accounts[0].id).eq('source_account', sourceAccount);
  assert.equal(error, null);
  return data;
};
try {
  for (const [source, name, text] of cases) {
    const document = prepareImportFiles(source, [{ name, text }]);
    assert.ok(document.entries.length, `${source}: no parsed entries`);
    let resolved = await resolveImportEntries(document.entries, {
      search: title => tmdb.search(title), findByImdbId: id => tmdb.findByImdbId(id),
      findByTvdbId: id => tmdb.findByTvdbId(id),
      getSeason: (id, season) => tmdb.getSeason(id, season),
    });
    if (primePlayback) {
      assert.ok(resolved.every(row => row.status === 'unmatched'), 'Playback must require explicit review');
      // This isolated QA explicitly selects the two movie titles in the sanitised fixture.
      resolved = resolved.map(row => {
        const candidates = row.candidates.filter(item => item.media_type === 'movie' && item.title === row.title && item.release_date?.startsWith(row.title === 'Palm Springs' ? '2020-' : '2002-'));
        assert.equal(candidates.length, 1, 'QA title must have one exact movie candidate');
        return chooseImportMatch(row, `movie:${candidates[0].id}`);
      });
    }
    const unmatched = resolved.filter(row => row.status !== 'matched');
    assert.ok(unmatched.every(row => row.reason === 'review'), `${source}: unexpected catalogue failure`);
    if (unmatched.length) console.log(`PASS ${source}: ${unmatched.length} ambiguous title/year matches require review and will not be written`);
    assert.ok(resolved.some(row => row.status === 'matched'), `${source}: no confirmed matches`);
    // Explicitly separate these synthetic QA watches from earlier pilot sources.
    const rows = resolved.filter(row => row.status === 'matched').map(row => ({ ...row, account: sourceAccount, duplicateDecision: 'keep' }));
    const first = await writeImportDocument({ userId: accounts[0].id, resolved: rows, summaryRows: [] });
    assert.equal(first.failed, 0, `${source}: write failed`);
    assert.equal(first.inserted + first.duplicates, rows.length);
    const retry = await writeImportDocument({ userId: accounts[0].id, resolved: rows, summaryRows: [] });
    assert.deepEqual(retry, { inserted: 0, duplicates: rows.length, failed: 0 });
    const saved = (await read(owner)).filter(row => row.source === source);
    assert.equal(saved.length, rows.length, `${source}: duplicate/missing persisted watches`);
    assert.deepEqual(saved.map(row => row.watched_on).sort(), rows.map(row => row.date?.slice(0, 10) || null).sort());
    if (primePlayback) {
      assert.ok(saved.every(row => row.date_precision === 'instant'));
      assert.deepEqual(saved.map(row => new Date(row.watched_at).toISOString()).sort(), rows.map(row => new Date(row.date).toISOString()).sort());
    } else assert.ok(saved.every(row => row.watched_at === null && row.date_precision === (row.watched_on ? 'day' : 'unknown')));
    if (netflixEpisodes) assert.ok(saved.every(row => row.season_number === 5 && Number.isSafeInteger(row.episode_number)));
    if (source === 'trakt') assert.ok(saved.some(row => row.season_number === 2 && row.episode_number === 13));
    console.log(`PASS ${source}: real catalogue, ${saved.length} persisted watches, replay idempotency and preserved date precision`);
  }
  assert.deepEqual(await read(other), []);
  console.log('PASS cross-account isolation for the complete source matrix');
  const after = await summaries();
  for (const row of before) assert.deepEqual(after.find(saved => saved.tmdb_id === row.tmdb_id && saved.media_type === row.media_type), row);
  console.log('PASS existing PLOT summary dates, ratings and notes stay unchanged across all sources');
} finally {
  owner.auth.stopAutoRefresh();
  other.auth.stopAutoRefresh();
}
