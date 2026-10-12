import test from 'node:test';
import assert from 'node:assert/strict';
import { episodeAlertsPromptForTick, hasPriorEpisodeProgress } from '../../episodeAlertsPrompt.js';

test('season 1 episode 1 is not prior progress', () => {
  assert.equal(hasPriorEpisodeProgress([]), false);
  assert.equal(hasPriorEpisodeProgress(null), false);
  assert.equal(hasPriorEpisodeProgress([{ current_season: 1, current_episode: 1 }]), false);
  assert.equal(hasPriorEpisodeProgress([{ current_season: '1', current_episode: '1' }]), false);
});

test('anything past season 1 episode 1 counts, on any show', () => {
  assert.equal(hasPriorEpisodeProgress([{ current_season: 1, current_episode: 2 }]), true);
  assert.equal(hasPriorEpisodeProgress([{ current_season: 2, current_episode: 1 }]), true);
  assert.equal(hasPriorEpisodeProgress([
    { current_season: 1, current_episode: 1 },
    { current_season: '3', current_episode: '1' },
  ]), true);
});

test('the prompt is only for a first forward episode tick', () => {
  const rows = [{ current_season: 1, current_episode: 1 }];
  assert.deepEqual(episodeAlertsPromptForTick({
    rows, userId: 'user-1', tmdbId: 11, title: 'North', forward: true,
  }), { userId: 'user-1', tmdbId: 11, title: 'North' });
  assert.equal(episodeAlertsPromptForTick({
    rows, userId: 'user-1', tmdbId: 11, title: 'North', forward: false,
  }), null);
  assert.equal(episodeAlertsPromptForTick({
    rows: [{ current_season: 1, current_episode: 4 }],
    userId: 'user-1', tmdbId: 11, title: 'North', forward: true,
  }), null);
  assert.equal(episodeAlertsPromptForTick({
    rows, userId: '', tmdbId: 11, forward: true,
  }), null);
  assert.equal(episodeAlertsPromptForTick({
    rows, userId: 'user-1', tmdbId: 0, forward: true,
  }), null);
});
