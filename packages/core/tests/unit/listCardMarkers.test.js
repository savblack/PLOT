import assert from 'node:assert/strict';
import test from 'node:test';
import { listCardMarkers } from '../../listCardMarkers.js';

const notes = { rows: { 'movie:1': { note: 'Saw the trailer twice' }, 'tv:2': { note: '' } } };
const history = [
  { tmdb_id: 3, media_type: 'tv', note: 'Loved the finale' },
  { tmdb_id: 1, media_type: 'tv', note: 'Same id, other type' },
  { tmdb_id: 4, media_type: 'movie', note: null },
];

test('a private note with text marks the card; an empty one does not', () => {
  assert.equal(listCardMarkers({ tmdb_id: 1, media_type: 'movie' }, history, notes).hasPrivateNote, true);
  assert.equal(listCardMarkers({ tmdb_id: 2, media_type: 'tv' }, history, notes).hasPrivateNote, false);
});

test('a review is a watch with a note, matched on id and type', () => {
  assert.equal(listCardMarkers({ tmdb_id: 3, media_type: 'tv' }, history, notes).hasReview, true);
  assert.equal(listCardMarkers({ tmdb_id: 1, media_type: 'movie' }, history, notes).hasReview, false);
  assert.equal(listCardMarkers({ tmdb_id: 4, media_type: 'movie' }, history, notes).hasReview, false);
});

test('string ids, a missing media type and missing data are handled', () => {
  assert.deepEqual(listCardMarkers({ tmdb_id: '1' }, null, notes), { hasPrivateNote: true, hasReview: false });
  assert.deepEqual(listCardMarkers({ id: 9 }, undefined, undefined), { hasPrivateNote: false, hasReview: false });
});
