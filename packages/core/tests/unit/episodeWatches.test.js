import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { configure } from '../../config.js';
import { createInMemorySupabase } from '../support/inMemorySupabase.js';
import { episodeWatchStates, readEpisodeWatches, saveEpisodeWatches } from '../../episodeWatches.js';
import { getEpisodeGuideState } from '../../episodeProgress.js';
import { getSeasonWatchState } from '../../watchingProgress.js';
const { id: tmdbId } = JSON.parse(readFileSync(new URL('../fixtures/imports/tmdb-episode-series.json', import.meta.url))).result;
const watched = { season_number: 1, episode_number: 3 };

test('an imported later episode leaves earlier episodes unwatched', () => {
  const episodeStates = episodeWatchStates([watched, watched], []);
  for (const episodeNumber of [1, 2]) {
    assert.equal(getEpisodeGuideState({ selectedSeason: 1, episodeNumber, episodeStates }).isWatched, false);
  }
  assert.equal(getEpisodeGuideState({ selectedSeason: 1, episodeNumber: 3, episodeStates }).isWatched, true);
  assert.deepEqual(getSeasonWatchState({ selectedSeason: 1, episodeCount: 5, episodeStates }),
    { episodeCount: 5, watchedCount: 1, isComplete: false });
});

test('explicit undo overrides both a legacy pointer and repeated imported watches', () => {
  const episodeStates = episodeWatchStates([watched, watched], [{ ...watched, watched: false }]);
  assert.equal(getEpisodeGuideState({ currentSeason: 2, currentEpisode: 1, selectedSeason: 1, episodeNumber: 3, episodeStates }).isWatched, false);
  assert.equal(getSeasonWatchState({ currentSeason: 2, selectedSeason: 1, episodeCount: 5, episodeStates }).isComplete, false);
});

test('specials are separate from the main series and season counts use actual ordinals', () => {
  const episodeStates = episodeWatchStates([{ season_number: 0, episode_number: 2 }], []);
  assert.equal(getEpisodeGuideState({ currentSeason: 2, selectedSeason: 0, episodeNumber: 1, episodeStates }).isWatched, false);
  assert.equal(getSeasonWatchState({ selectedSeason: 0, episodeCount: 2, episodeNumbers: [2, 4], episodeStates }).watchedCount, 1);
});

test('reads beyond the row cap, isolates accounts and rejects a partial read', async () => {
  const events = Array.from({ length: 1201 }, (_, index) => ({ id: index, user_id: 'owner', tmdb_id: tmdbId, media_type: 'tv', season_number: 1, episode_number: index + 1 }));
  const client = createInMemorySupabase({ tables: { watch_events: [...events, { ...events[0], user_id: 'other', episode_number: 9999 }], episode_watch_overrides: [] } });
  configure({ supabaseClient: client });
  const states = await readEpisodeWatches('owner', tmdbId);
  assert.equal(Object.keys(states).length, 1201);
  assert.equal(states['1:9999'], undefined);
  client.failNext('episode_watch_overrides', 'select', { message: 'offline' });
  await assert.rejects(readEpisodeWatches('owner', tmdbId));
});

test('undo, retry and redo change only selected episodes and retain source records', async () => {
  const source = { ...watched, id: 'source', user_id: 'owner', tmdb_id: tmdbId, media_type: 'tv' };
  const client = createInMemorySupabase({ tables: { watch_events: [source] }, unique: {
    episode_watch_overrides: ['user_id', 'tmdb_id', 'season_number', 'episode_number'],
  } });
  configure({ supabaseClient: client });
  await saveEpisodeWatches('owner', tmdbId, 1, [3], false);
  await saveEpisodeWatches('owner', tmdbId, 1, [3], false);
  assert.deepEqual(await readEpisodeWatches('owner', tmdbId), { '1:3': false });
  client.failNext('episode_watch_overrides', 'upsert', { message: 'offline' });
  await assert.rejects(saveEpisodeWatches('owner', tmdbId, 1, [3], true));
  assert.deepEqual(await readEpisodeWatches('owner', tmdbId), { '1:3': false });
  await saveEpisodeWatches('owner', tmdbId, 1, [3, 5], true);
  assert.deepEqual(await readEpisodeWatches('owner', tmdbId), { '1:3': true, '1:5': true });
  assert.deepEqual(client.__db.tables.watch_events, [source]);
  assert.equal(client.__db.tables.episode_watch_overrides.length, 2);
});
