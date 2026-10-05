import test from 'node:test';
import assert from 'node:assert/strict';
import { nextEpisodeLine } from '../../episodeAlerts.js';

const today = '2026-10-04';

test('a premiere reads as "Season N premiere" with a short date', () => {
  const line = nextEpisodeLine({ next_episode_to_air: { air_date: '2026-10-09', season_number: 5, episode_number: 1 } }, today);
  assert.deepEqual(line, { date: '2026-10-09', when: 'Fri 9 Oct', label: 'Season 5 premiere' });
});

test('a mid-season episode reads as S·E', () => {
  const line = nextEpisodeLine({ next_episode_to_air: { air_date: today, season_number: 2, episode_number: 7 } }, today);
  assert.equal(line.label, 'S2 · E7');
  assert.equal(line.when, 'Sun 4 Oct');
});

test('nothing dated, or a date already past, is no line', () => {
  assert.equal(nextEpisodeLine({ next_episode_to_air: null }, today), null);
  assert.equal(nextEpisodeLine({ next_episode_to_air: { air_date: null } }, today), null);
  assert.equal(nextEpisodeLine({ next_episode_to_air: { air_date: '2026-10-03', season_number: 1, episode_number: 2 } }, today), null);
  assert.equal(nextEpisodeLine(null, today), null);
});
