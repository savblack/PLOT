import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';

import { configure } from '../../config.js';
import { logWatchedItem } from '../../userMedia.js';
import { createInMemorySupabase } from '../support/inMemorySupabase.js';

/* History is one row per title, and logWatchedItem upserts it. Every caller
 * that only means "I watched this (again)" — the Watched / Didn't finish
 * status menu, favouriting, finishing a series — used to send rating: null,
 * note: null, dnf: false along with the date, so a watch of anything you had
 * already reviewed erased the review. Only fields the caller actually passed
 * may reach the row; an explicit null is still how a caller clears one.
 */

const { id: tmdbId, name } = JSON.parse(readFileSync(
  new URL('../fixtures/imports/tmdb-episode-series.json', import.meta.url))).result;

const reviewed = {
  id: 'h1', user_id: 'u1', tmdb_id: tmdbId, media_type: 'tv', title: name,
  watched_at: '2026-01-01', rating: 8, note: 'Loved the finale', dnf: false,
};

function withHistory(rows) {
  const client = createInMemorySupabase({
    tables: { history: rows },
    unique: { history: ['user_id', 'tmdb_id', 'media_type'] },
  });
  configure({ supabaseClient: client });
  return client;
}

test('a date-only watch of a reviewed title moves watched_at and keeps rating, note and dnf', async () => {
  const client = withHistory([{ ...reviewed, dnf: true }]);

  const { error } = await logWatchedItem({
    userId: 'u1', item: { id: tmdbId, media_type: 'tv', title: name }, watchedAt: '2026-09-27',
  });

  assert.equal(error, null);
  const [row] = client.__db.tables.history;
  assert.equal(client.__db.tables.history.length, 1);
  assert.equal(row.watched_at, '2026-09-27');
  assert.equal(row.rating, 8);
  assert.equal(row.note, 'Loved the finale');
  assert.equal(row.dnf, true);
});

test('a date-only watch of a new title writes identity and date, leaving review fields to the column defaults', async () => {
  const client = withHistory([]);

  await logWatchedItem({
    userId: 'u1', item: { id: tmdbId, media_type: 'tv', name }, watchedAt: '2026-09-27',
  });

  const [row] = client.__db.tables.history;
  assert.equal(row.tmdb_id, tmdbId);
  assert.equal(row.media_type, 'tv');
  assert.equal(row.title, name);
  assert.equal(row.watched_at, '2026-09-27');
  assert.equal('rating' in row || 'note' in row || 'dnf' in row, false);
});

test('explicitly passed values still overwrite, and an explicit null still clears', async () => {
  const client = withHistory([{ ...reviewed }]);

  await logWatchedItem({
    userId: 'u1', item: { id: tmdbId, media_type: 'tv', title: name },
    rating: 6, note: null, dnf: true, watchedAt: '2026-09-27',
  });

  const [row] = client.__db.tables.history;
  assert.equal(row.rating, 6);
  assert.equal(row.note, null);
  assert.equal(row.dnf, true);
});

test('switching Didn\'t finish back to Watched clears dnf but keeps the review', async () => {
  const client = withHistory([{ ...reviewed, dnf: true }]);

  await logWatchedItem({
    userId: 'u1', item: { id: tmdbId, media_type: 'tv', title: name }, dnf: false, watchedAt: '2026-09-27',
  });

  const [row] = client.__db.tables.history;
  assert.equal(row.dnf, false);
  assert.equal(row.rating, 8);
  assert.equal(row.note, 'Loved the finale');
});
