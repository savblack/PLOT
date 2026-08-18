import assert from 'node:assert/strict';
import test from 'node:test';

import {
  getLastSeasonNumber,
  getNextEpisodeProgress,
  getSeasonToggleProgress,
  getSeasonWatchState,
  isSeriesComplete,
} from '../../watchingProgress.js';

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

/* ── getSeasonWatchState ── */

test('counts a season behind the pointer as fully watched', () => {
  assert.deepEqual(
    getSeasonWatchState({ currentSeason: 3, currentEpisode: 2, selectedSeason: 1, episodeCount: 10 }),
    { episodeCount: 10, watchedCount: 10, isComplete: true },
  );
});

test('counts a season ahead of the pointer as untouched', () => {
  assert.deepEqual(
    getSeasonWatchState({ currentSeason: 2, currentEpisode: 5, selectedSeason: 4, episodeCount: 8 }),
    { episodeCount: 8, watchedCount: 0, isComplete: false },
  );
});

test('counts episodes before the pointer within the current season', () => {
  assert.deepEqual(
    getSeasonWatchState({ currentSeason: 2, currentEpisode: 5, selectedSeason: 2, episodeCount: 10 }),
    { episodeCount: 10, watchedCount: 4, isComplete: false },
  );
});

test('treats the current season as complete once the pointer sits past its last episode', () => {
  const result = getSeasonWatchState({
    currentSeason: 2,
    currentEpisode: 11,
    selectedSeason: 2,
    episodeCount: 10,
  });
  assert.deepEqual(result, { episodeCount: 10, watchedCount: 10, isComplete: true });
});

test('never reports a negative watched count when the pointer is on episode 1', () => {
  const result = getSeasonWatchState({
    currentSeason: 1,
    currentEpisode: 1,
    selectedSeason: 1,
    episodeCount: 6,
  });
  assert.deepEqual(result, { episodeCount: 6, watchedCount: 0, isComplete: false });
});

test('reports an empty state when the episode count is unknown', () => {
  assert.deepEqual(
    getSeasonWatchState({ currentSeason: 1, currentEpisode: 3, selectedSeason: 1, episodeCount: 0 }),
    { episodeCount: 0, watchedCount: 0, isComplete: false },
  );
});

test('reports an empty state when no season is selected', () => {
  assert.deepEqual(getSeasonWatchState(), { episodeCount: 0, watchedCount: 0, isComplete: false });
});

/* ── getSeasonToggleProgress ── */

test('marking a season watched rolls the pointer into the next season', () => {
  assert.deepEqual(getSeasonToggleProgress({ selectedSeason: 2, isComplete: false }), {
    ok: true,
    nextSeason: 3,
    nextEpisode: 1,
  });
});

test('unmarking a watched season rewinds the pointer to its first episode', () => {
  assert.deepEqual(getSeasonToggleProgress({ selectedSeason: 2, isComplete: true }), {
    ok: true,
    nextSeason: 2,
    nextEpisode: 1,
  });
});

test('refuses to toggle when the season number is missing or invalid', () => {
  const expected = {
    ok: false,
    code: 'missing-season',
    error: 'Could not tell which season to update.',
  };
  assert.deepEqual(getSeasonToggleProgress(), expected);
  assert.deepEqual(getSeasonToggleProgress({ selectedSeason: 0 }), expected);
});

/* ── getLastSeasonNumber ── */

test('takes the highest season number and ignores the specials bucket', () => {
  const details = { seasons: [{ season_number: 0 }, { season_number: 1 }, { season_number: 3 }] };
  assert.equal(getLastSeasonNumber(details), 3);
});

test('falls back to number_of_seasons when the season list has not loaded', () => {
  assert.equal(getLastSeasonNumber({ number_of_seasons: 5 }), 5);
  assert.equal(getLastSeasonNumber({ seasons: [{ season_number: 0 }], number_of_seasons: 5 }), 5);
});

test('reports 0 when neither the season list nor the count is usable', () => {
  assert.equal(getLastSeasonNumber(null), 0);
  assert.equal(getLastSeasonNumber({}), 0);
  assert.equal(getLastSeasonNumber({ seasons: [], number_of_seasons: 0 }), 0);
});

/* ── isSeriesComplete ── */

test('completes an ended series once progress moves past its last season', () => {
  assert.equal(isSeriesComplete({ status: 'Ended', lastSeason: 3, nextSeason: 4 }), true);
  assert.equal(isSeriesComplete({ status: 'Canceled', lastSeason: 2, nextSeason: 3 }), true);
});

test('does not complete an ended series while seasons remain', () => {
  assert.equal(isSeriesComplete({ status: 'Ended', lastSeason: 3, nextSeason: 3 }), false);
  assert.equal(isSeriesComplete({ status: 'Ended', lastSeason: 3, nextSeason: 2 }), false);
});

test('never completes a show that is still producing seasons', () => {
  assert.equal(isSeriesComplete({ status: 'Returning Series', lastSeason: 3, nextSeason: 4 }), false);
  assert.equal(isSeriesComplete({ status: 'In Production', lastSeason: 1, nextSeason: 2 }), false);
});

test('never completes when the status or season count is unknown', () => {
  assert.equal(isSeriesComplete({ lastSeason: 3, nextSeason: 4 }), false);
  assert.equal(isSeriesComplete({ status: 'Ended', lastSeason: 0, nextSeason: 4 }), false);
  assert.equal(isSeriesComplete({ status: 'Ended', lastSeason: 3, nextSeason: 0 }), false);
  assert.equal(isSeriesComplete(), false);
});
