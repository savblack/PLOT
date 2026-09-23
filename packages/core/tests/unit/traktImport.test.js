import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { parsePlatform } from '../../importParsing.js';
import { identifyImportEntries, importEventIdentity } from '../../importEvents.js';

const sample = JSON.parse(readFileSync(new URL('../fixtures/imports/trakt-history.json', import.meta.url), 'utf8'));
const parse = rows => parsePlatform('trakt', JSON.stringify(rows));

test('Trakt saved history retains episode ordinals and unknown watch dates', () => {
  const rows = parse(sample);
  assert.equal(rows[0].seasonNumber, sample[0].episode.season);
  assert.equal(rows[0].episodeNumber, sample[0].episode.number);
  assert.equal(rows[0].externalIds.imdb, sample[0].show.ids.imdb);
  assert.equal(rows[1].hint, 'movie');
  assert.equal(rows[1].date, null);
  assert.equal(rows[1].datePrecision, 'unknown');
  assert.equal(rows[0].tmdbId, undefined);
});

test('Trakt preserves timestamp precision, rewatches and stable identities across file changes', () => {
  const rows = [sample[0], { ...sample[0], id: sample[0].id + 1, watched_at: '2024-02-29T12:30:15.123Z' }];
  const parsed = parse(rows);
  assert.equal(parsed[1].date, rows[1].watched_at);
  assert.equal(parsed[1].datePrecision, 'instant');
  const a = identifyImportEntries(parsed, 'trakt', JSON.stringify(rows));
  const b = identifyImportEntries(parsed, 'trakt', JSON.stringify(rows, null, 2));
  assert.equal(importEventIdentity(a[0]), importEventIdentity(b[0]));
  assert.notEqual(importEventIdentity(a[0]), importEventIdentity(a[1]));
});

test('Trakt rejects a whole file if any record is unsupported or invalid', () => {
  for (const patch of [
    { type: 'show' }, { action: 'unknown' }, { id: 1.5 },
    { watched_at: '2024-02-30T00:00:00Z' }, { watched_at: '2024-01-01' },
    { watched_at: undefined }, { episode: { season: 1 } },
    { show: { ...sample[0].show, ids: {} } },
  ]) assert.throws(() => parse([sample[1], { ...sample[0], ...patch }]), /Unsupported Trakt/);
  assert.throws(() => parse({ history: sample }), /Unsupported Trakt/);
  assert.throws(() => parsePlatform('trakt', 'not JSON'), /Unsupported Trakt/);
});

test('Trakt confirmed preview cannot fall back to summary writes after the flag is disabled', async () => {
  const { configure } = await import('../../config.js');
  const { writeImportSelection } = await import('../../importPipeline.js');
  configure({ importEventsEnabled: false, supabaseClient: {
    from() { throw new Error('Unexpected legacy write'); },
    rpc() { throw new Error('Unexpected event write'); },
  } });
  const outcome = await writeImportSelection({ userId: 'owner', resolved: [{ source: 'trakt', status: 'matched' }], summaryRows: [] });
  assert.deepEqual(outcome, { inserted: 0, failed: 1, duplicates: 0 });
});

test('Trakt watchlist exports preserve memberships without creating watch dates', () => {
  const file = readFileSync(new URL('../fixtures/imports/trakt-watchlist.json', import.meta.url), 'utf8');
  const rows = parsePlatform('trakt', file, { fileName: 'lists-watchlist.json' });
  assert.equal(rows.length, 2);
  assert.deepEqual(rows.map(row => row.hint), ['movie', 'tv']);
  assert.ok(rows.every(row => row.destination.kind === 'watchlist' && row.date === null));
  assert.ok(rows.every(row => row.eventId.startsWith('watchlist:')));
  assert.ok(rows.every(row => !Object.hasOwn(row.externalIds, 'tmdb')));
  const records = JSON.parse(file);
  records[0].notes = 'Watch together';
  assert.equal(parsePlatform('trakt', JSON.stringify(records), { fileName: 'lists-watchlist.json' })[0].listNote, 'Watch together');
  records[0].my_rating = { rating: 8 };
  assert.deepEqual(parsePlatform('trakt', JSON.stringify(records), { fileName: 'lists-watchlist.json' })[0].sourceMetadata.trakt_rating, { rating: 8 });
  assert.throws(() => parsePlatform('trakt', file, { fileName: 'renamed.json' }), /Unsupported Trakt history/);
});
