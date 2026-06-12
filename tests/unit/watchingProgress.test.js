import assert from 'node:assert/strict';
import test from 'node:test';
import { getNextEpisodeProgress } from '../../src/utils/watchingProgress.js';

test('getNextEpisodeProgress advances within the current season when episode data is present', () => {
  const result = getNextEpisodeProgress(
    { current_season: 2, current_episode: 3 },
    { episodes: [{}, {}, {}, {}, {}] }
  );

  assert.deepEqual(result, {
    ok: true,
    nextSeason: 2,
    nextEpisode: 4,
    episodeCount: 5,
  });
});

test('getNextEpisodeProgress rolls over to the next season after the final episode', () => {
  const result = getNextEpisodeProgress(
    { current_season: 1, current_episode: 10 },
    { episodes: Array.from({ length: 10 }, () => ({})) }
  );

  assert.deepEqual(result, {
    ok: true,
    nextSeason: 2,
    nextEpisode: 1,
    episodeCount: 10,
  });
});

test('getNextEpisodeProgress returns a structured error when season data is unavailable', () => {
  const result = getNextEpisodeProgress(
    { current_season: 1, current_episode: 2, total_episodes: null },
    null
  );

  assert.deepEqual(result, {
    ok: false,
    code: 'missing-season-data',
    error: 'Could not load this season right now. Try again in a moment.',
  });
});
