import assert from 'node:assert/strict';
import test from 'node:test';

import { topListSlotFields } from '../../useTopLists.js';

const noFetch = async () => { throw new Error('should not fetch'); };

test('topListSlotFields uses tmdb_id, not a history row id', async () => {
  const historyRow = { id: 48213, tmdb_id: 129, media_type: 'movie', title: 'Spirited Away', poster_path: '/a.jpg' };
  const fields = await topListSlotFields('movies', historyRow, noFetch);
  assert.equal(fields.tmdb_id, 129);
});

test('topListSlotFields falls back to id for a TMDB result, which has no tmdb_id', async () => {
  const result = { id: 129, media_type: 'movie', title: 'Spirited Away', poster_path: '/a.jpg' };
  const fields = await topListSlotFields('movies', result, noFetch);
  assert.deepEqual(fields, { tmdb_id: 129, media_type: 'movie', title: 'Spirited Away', poster_path: '/a.jpg' });
});

test('topListSlotFields fills a missing poster from TMDB details', async () => {
  const calls = [];
  const fields = await topListSlotFields(
    'movies',
    { id: 7, tmdb_id: 129, media_type: 'movie', title: 'Spirited Away', poster_path: null },
    async (type, id) => { calls.push([type, id]); return { poster_path: '/from-tmdb.jpg' }; },
  );
  assert.deepEqual(calls, [['movie', 129]]);
  assert.equal(fields.poster_path, '/from-tmdb.jpg');
  assert.equal(fields.title, 'Spirited Away');
});

test('topListSlotFields still saves when the details lookup fails', async () => {
  const fields = await topListSlotFields('tv', { tmdb_id: 5, name: 'Show' }, async () => { throw new Error('offline'); });
  assert.deepEqual(fields, { tmdb_id: 5, media_type: 'tv', title: 'Show', poster_path: null });
});
