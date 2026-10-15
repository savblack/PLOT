import test from 'node:test';
import assert from 'node:assert/strict';
import { endsAtTime, remainingAiredEpisodes, showTimeLeft, timeLeftCaption } from '../../timeLeft.js';

const show = {
  episode_run_time: [40],
  last_episode_to_air: { season_number: 2, episode_number: 4, runtime: 40 },
  seasons: [
    { season_number: 0, episode_count: 3 },
    { season_number: 1, episode_count: 3 },
    { season_number: 2, episode_count: 4 },
  ],
};

test('remaining episodes skip specials and stop at the last aired episode', () => {
  assert.deepEqual(
    remainingAiredEpisodes(show, 1, 3).map(item => `${item.season}:${item.episode}`),
    ['1:3', '2:1', '2:2', '2:3', '2:4'],
  );
  assert.deepEqual(remainingAiredEpisodes(show, 2, 5), []);
  assert.deepEqual(remainingAiredEpisodes(show, 0, 1), []);
});

test('known runtimes win and the show average fills the gaps', () => {
  const left = showTimeLeft({
    details: show,
    season: 2,
    episode: 3,
    knownEpisodes: [{ season_number: 2, episode_number: 3, runtime: 50 }],
  });
  assert.equal(left.episodesLeft, 2);
  assert.equal(left.minutesLeft, 90);
  assert.equal(left.missingRuntimes, 0);
  assert.equal(timeLeftCaption(left), '2 episodes · 1h 30m left');
});

test('a gap with no average leaves the total unset', () => {
  const left = showTimeLeft({
    details: { ...show, episode_run_time: [], last_episode_to_air: { season_number: 2, episode_number: 4 } },
    season: 2,
    episode: 3,
    knownEpisodes: [{ season_number: 2, episode_number: 3, runtime: 50 }],
  });
  assert.equal(left.episodesLeft, 2);
  assert.equal(left.minutesLeft, null);
  assert.equal(left.missingRuntimes, 1);
  assert.equal(timeLeftCaption(left), '2 episodes left');
});

test('ends at follows the locale clock', () => {
  const now = new Date('2026-10-13T12:00:00Z');
  assert.equal(endsAtTime(102, now, { locales: 'en-US', timeZone: 'UTC' }), '1:42 PM');
  assert.equal(endsAtTime(102, now, { locales: 'en-GB', timeZone: 'UTC' }), '13:42');
  assert.equal(endsAtTime(0, now), null);
  assert.equal(endsAtTime(40, new Date('nope')), null);
});
