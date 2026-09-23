import test from 'node:test';
import assert from 'node:assert/strict';
import { zipSync, strToU8 } from 'fflate';
import { prepareTvTimeArchive } from '../../importArchive.js';
import { prepareImportFiles } from '../../importDocument.js';
import { importEventIdentity } from '../../importEvents.js';
import sample from '../fixtures/imports/trakt-history.json' with { type: 'json' };
const media = sample[1].movie;
const text = JSON.stringify([{ title: media.title, id: media.ids, is_watched: true, watched_at: null, rating: null }]);

test('TV Time ZIP and extracted files preserve the same watch identity', () => {
  const document = prepareTvTimeArchive(zipSync({ 'movies.json': strToU8(text), 'activity_history.csv': strToU8('duplicate representation') }));
  const file = prepareImportFiles('tvtime', [{ name: 'movies.json', text }]);
  assert.equal(importEventIdentity(document.entries[0]), importEventIdentity(file.entries[0]));
  assert.equal(document.entries.length, 1);
  assert.equal(document.notImported[0].title, 'activity_history.csv');
  assert.equal(document.entries[0].date, null);
});

test('TV Time ZIP rejects missing supported files, malformed data and unsafe names', () => {
  assert.throws(() => prepareTvTimeArchive(strToU8('not zip')), /invalid or unsupported/);
  assert.throws(() => prepareTvTimeArchive(zipSync({ 'unknown.json': strToU8('[]') })), /No supported/);
  assert.throws(() => prepareTvTimeArchive(zipSync({ 'movies.json': strToU8(text), 'shows.json': strToU8('invalid') })), /Unsupported TV Time/);
  assert.throws(() => prepareTvTimeArchive(zipSync({ '../movies.json': strToU8(text) })), /invalid or unsupported/);
});

test('TV Time ZIP bounds expansion and file counts before returning any records', () => {
  const files = Object.fromEntries(Array.from({ length: 101 }, (_, i) => [`${i}.txt`, new Uint8Array()]));
  assert.throws(() => prepareTvTimeArchive(zipSync(files)), /too large/);
  assert.throws(() => prepareTvTimeArchive(new Uint8Array(20 * 1024 * 1024 + 1)), /too large/);
  // Alter the declared expanded size without allocating a giant test fixture.
  const bytes = zipSync({ 'movies.json': strToU8(text) });
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  for (let i = 0; i < bytes.length - 24; i++) {
    if (view.getUint32(i, true) === 0x02014b50) { view.setUint32(i + 24, 51 * 1024 * 1024, true); break; }
  }
  assert.throws(() => prepareTvTimeArchive(bytes), /too large/);
});

test('TV Time ZIP rejects payload damage even when the damaged JSON still parses', () => {
  const bytes = zipSync({ 'movies.json': strToU8(text) }, { level: 0 });
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const start = 30 + view.getUint16(26, true) + view.getUint16(28, true);
  const titleAt = text.indexOf(media.title);
  bytes[start + titleAt] = media.title[0] === 'A' ? 66 : 65;
  assert.doesNotThrow(() => JSON.parse(new TextDecoder().decode(bytes.subarray(start, start + strToU8(text).length))));
  assert.throws(() => prepareTvTimeArchive(bytes), /invalid or unsupported/);
});

test('TV Time ZIP rejects inconsistent metadata, encryption and truncated archives', () => {
  const make = () => zipSync({ 'movies.json': strToU8(text) });
  const nameMismatch = make();
  nameMismatch[30] = 120;
  assert.throws(() => prepareTvTimeArchive(nameMismatch), /invalid or unsupported/);
  const encrypted = make();
  new DataView(encrypted.buffer).setUint16(6, 1, true);
  assert.throws(() => prepareTvTimeArchive(encrypted), /invalid or unsupported/);
  for (const length of [0, 1, 20, make().length - 1]) assert.throws(() => prepareTvTimeArchive(make().subarray(0, length)), /invalid or unsupported/);
});

test('ZIP CRC validates the standard check vector', async () => {
  const { zipCrc32 } = await import('../../zipIntegrity.js');
  assert.equal(zipCrc32(strToU8('123456789')), 0xcbf43926);
});

test('Trakt ZIP separates watchlist membership and history while retaining extracted identities', async () => {
  const { prepareImportArchive } = await import('../../importArchive.js');
  const history = JSON.stringify(sample);
  const watchlist = JSON.stringify([{ type: 'movie', id: 1, movie: sample[1].movie, notes: null, my_rating: null }]);
  const document = prepareImportArchive('trakt', zipSync({ 'watched-history.json': strToU8(history), 'lists-watchlist.json': strToU8(watchlist), 'ratings-movies.json': strToU8('[]') }));
  assert.equal(document.entries.length, 3);
  assert.equal(document.entries.filter(row => row.destination).length, 1);
  assert.equal(document.notImported[0].title, 'ratings-movies.json');
  const extracted = prepareImportFiles('trakt', [{ name: 'watched-history.json', text: history }]);
  assert.equal(importEventIdentity(document.entries[0]), importEventIdentity(extracted.entries[0]));
  assert.equal(document.entries[2].date, null);
});

test('file selection rejects oversized metadata before calling any file reader', async () => {
  const { readImportSelection } = await import('../../importArchive.js');
  const reader = { text: async () => assert.fail('Do not load oversized files'), arrayBuffer: async () => assert.fail('Do not load oversized archives') };
  await assert.rejects(readImportSelection('trakt', [{ ...reader, name: 'export.zip', size: 21 * 1024 * 1024 }]), /too large/);
  await assert.rejects(readImportSelection('trakt', [{ ...reader, name: 'a.json', size: 30 * 1024 * 1024 }, { ...reader, name: 'b.json', size: 30 * 1024 * 1024 }]), /too large/);
  await assert.rejects(readImportSelection('trakt', Array.from({ length: 101 }, (_, i) => ({ ...reader, name: `${i}.json`, size: 1 }))), /too large/);
});

test('missing file size metadata cannot bypass UTF-8 limits or load later files', async () => {
  const { readImportSelection } = await import('../../importArchive.js');
  const oversized = '界'.repeat(18 * 1024 * 1024); // 54 MiB UTF-8, only 18 MiB UTF-16 code units.
  await assert.rejects(readImportSelection('trakt', [
    { name: 'first.json', text: async () => oversized, arrayBuffer: async () => new ArrayBuffer(0) },
    { name: 'second.json', text: async () => assert.fail('Stop after the size limit'), arrayBuffer: async () => new ArrayBuffer(0) },
  ]), /too large/);
});

test('file reading errors stop the selection before parsing or loading remaining files', async () => {
  const { readImportSelection } = await import('../../importArchive.js');
  await assert.rejects(readImportSelection('trakt', [
    { name: 'first.json', size: 1, text: async () => { throw new Error('File no longer available'); }, arrayBuffer: async () => new ArrayBuffer(0) },
    { name: 'second.json', size: 1, text: async () => assert.fail('No additional reads'), arrayBuffer: async () => new ArrayBuffer(0) },
  ]), /no longer available/);
});
