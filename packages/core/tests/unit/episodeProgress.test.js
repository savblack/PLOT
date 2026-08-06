import assert from 'node:assert/strict';
import test from 'node:test';

import { getEpisodeGuideState } from '../../episodeProgress.js';

test('an earlier season is fully watched but never current', () => {
  assert.deepEqual(
    getEpisodeGuideState({ currentSeason: 2, currentEpisode: 5, selectedSeason: 1, episodeNumber: 9 }),
    { isCurrent: false, isWatched: true, isActive: true },
  );
});

test('within the current season, an earlier episode is watched', () => {
  assert.deepEqual(
    getEpisodeGuideState({ currentSeason: 2, currentEpisode: 5, selectedSeason: 2, episodeNumber: 3 }),
    { isCurrent: false, isWatched: true, isActive: true },
  );
});

test('within the current season, the current episode is current but not watched', () => {
  assert.deepEqual(
    getEpisodeGuideState({ currentSeason: 2, currentEpisode: 5, selectedSeason: 2, episodeNumber: 5 }),
    { isCurrent: true, isWatched: false, isActive: true },
  );
});

test('within the current season, a later episode is neither watched nor current', () => {
  assert.deepEqual(
    getEpisodeGuideState({ currentSeason: 2, currentEpisode: 5, selectedSeason: 2, episodeNumber: 8 }),
    { isCurrent: false, isWatched: false, isActive: false },
  );
});

test('a later season is never watched or current', () => {
  assert.deepEqual(
    getEpisodeGuideState({ currentSeason: 2, currentEpisode: 5, selectedSeason: 3, episodeNumber: 1 }),
    { isCurrent: false, isWatched: false, isActive: false },
  );
});

test('defaults everything to 0, which is treated as the current episode', () => {
  assert.deepEqual(getEpisodeGuideState({}), { isCurrent: true, isWatched: false, isActive: true });
});
