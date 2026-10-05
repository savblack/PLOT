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

import { filterByWatchStatus, listProgress } from '@plot/core/listWatchStatus.js';

const items = [
  { tmdb_id: 1, media_type: 'movie' },
  { tmdb_id: 2, media_type: 'movie' },
  { tmdb_id: 3, media_type: 'tv' },
  { tmdb_id: 4, media_type: 'movie' },
];
const history = [
  { tmdb_id: 1, media_type: 'movie', dnf: false },
  { tmdb_id: 2, media_type: 'movie', dnf: true },
];
const watching = [{ tmdb_id: 3 }];

test('filterByWatchStatus returns everything when nothing is selected', () => {
  assert.equal(filterByWatchStatus(items, [], history, watching).length, 4);
});

test('filterByWatchStatus keeps the chosen statuses, with none as not watched', () => {
  const ids = (sel) => filterByWatchStatus(items, sel, history, watching).map(i => i.tmdb_id);
  assert.deepEqual(ids(['none']), [4]);
  assert.deepEqual(ids(['watched']), [1]);
  assert.deepEqual(ids(['watching', 'dnf']), [2, 3]);
});

test('listProgress counts finished watches and rounds the percentage', () => {
  assert.deepEqual(listProgress(items, history, watching), { total: 4, watched: 1, watching: 1, dnf: 1, percent: 25 });
  assert.deepEqual(listProgress([], history, watching), { total: 0, watched: 0, watching: 0, dnf: 0, percent: 0 });
});
