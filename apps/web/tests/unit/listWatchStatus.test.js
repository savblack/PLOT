import test from 'node:test';
import assert from 'node:assert/strict';

import { listWatchStatus, isFinishedStatus } from '@plot/core/listWatchStatus.js';

const movie = { tmdb_id: 10, media_type: 'movie' };
const show = { tmdb_id: 10, media_type: 'tv' };

test('a title with no history and no progress has no status', () => {
  assert.equal(listWatchStatus(movie, [], []), null);
});

test('a logged watch reads as watched, and dnf reads as didn\'t finish', () => {
  assert.equal(listWatchStatus(movie, [{ tmdb_id: 10, media_type: 'movie', dnf: false }], []), 'watched');
  assert.equal(listWatchStatus(movie, [{ tmdb_id: 10, media_type: 'movie', dnf: true }], []), 'dnf');
});

test('any finished watch beats a did-not-finish entry for the same title', () => {
  const entries = [
    { tmdb_id: 10, media_type: 'movie', dnf: true },
    { tmdb_id: 10, media_type: 'movie', dnf: false },
  ];
  assert.equal(listWatchStatus(movie, entries, []), 'watched');
});

test('a show in progress reads as watching even with history', () => {
  assert.equal(listWatchStatus(show, [{ tmdb_id: 10, media_type: 'tv', dnf: false }], [{ tmdb_id: '10' }]), 'watching');
});

test('movie and TV ids that collide do not share a status', () => {
  assert.equal(listWatchStatus(movie, [{ tmdb_id: 10, media_type: 'tv', dnf: false }], [{ tmdb_id: 10 }]), null);
  assert.equal(listWatchStatus(show, [{ tmdb_id: 10, media_type: 'movie', dnf: false }], []), null);
});

test('only watched and didn\'t finish grey out', () => {
  assert.equal(isFinishedStatus('watched'), true);
  assert.equal(isFinishedStatus('dnf'), true);
  assert.equal(isFinishedStatus('watching'), false);
  assert.equal(isFinishedStatus(null), false);
});
