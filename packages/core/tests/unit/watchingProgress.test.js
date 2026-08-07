import assert from 'node:assert/strict';
import test from 'node:test';

import { getNextEpisodeProgress } from '../../watchingProgress.js';

test('reports missing-progress when there is no progress object', () => {
  assert.deepEqual(getNextEpisodeProgress(null, {}), {
    ok: false,
    code: 'missing-progress',
    error: 'Could not find your current episode progress.',
  });
});

test('reports missing-season-data when neither season.episodes nor total_episodes yields a count', () => {
  const result = getNextEpisodeProgress({ current_season: 1, current_episode: 2, total_episodes: 0 }, null);
  assert.deepEqual(result, {
    ok: false,
    code: 'missing-season-data',
    error: 'Could not load this season right now. Try again in a moment.',
  });
});

test('prefers season.episodes.length over progress.total_episodes', () => {
  const result = getNextEpisodeProgress(
    { current_season: 2, current_episode: 9, total_episodes: 99 },
    { episodes: new Array(10) },
  );
  assert.equal(result.episodeCount, 10);
});

test('falls back to progress.total_episodes when season.episodes.length is 0', () => {
  const result = getNextEpisodeProgress(
    { current_season: 1, current_episode: 3, total_episodes: 8 },
    { episodes: [] },
  );
  assert.equal(result.episodeCount, 8);
});

test('advances to the next episode within the same season', () => {
  const result = getNextEpisodeProgress({ current_season: 2, current_episode: 9 }, { episodes: new Array(10) });
  assert.deepEqual(result, { ok: true, nextSeason: 2, nextEpisode: 10, episodeCount: 10 });
});

test('rolls over to episode 1 of the next season once the episode count is exceeded', () => {
  const result = getNextEpisodeProgress({ current_season: 2, current_episode: 10 }, { episodes: new Array(10) });
  assert.deepEqual(result, { ok: true, nextSeason: 3, nextEpisode: 1, episodeCount: 10 });
});

test('uses progress.total_episodes directly when no season object is given', () => {
  const result = getNextEpisodeProgress({ current_season: 1, current_episode: 3, total_episodes: 8 }, null);
  assert.deepEqual(result, { ok: true, nextSeason: 1, nextEpisode: 4, episodeCount: 8 });
});
