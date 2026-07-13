import assert from 'node:assert/strict';
import test from 'node:test';

import { getEpisodeGuideState } from '../../src/utils/episodeProgress.js';
import { pickBestTvmazeShowMatch } from '../../src/utils/tvmaze.js';

test('getEpisodeGuideState marks the current episode as active but not watched', () => {
  assert.deepEqual(
    getEpisodeGuideState({
      currentEpisode: 3,
      currentSeason: 2,
      episodeNumber: 3,
      selectedSeason: 2,
    }),
    {
      isActive: true,
      isCurrent: true,
      isWatched: false,
    }
  );
});

test('getEpisodeGuideState marks prior episodes as watched and active', () => {
  assert.deepEqual(
    getEpisodeGuideState({
      currentEpisode: 3,
      currentSeason: 2,
      episodeNumber: 2,
      selectedSeason: 2,
    }),
    {
      isActive: true,
      isCurrent: false,
      isWatched: true,
    }
  );
});

test('pickBestTvmazeShowMatch prefers the candidate that matches title and year', () => {
  const result = pickBestTvmazeShowMatch(
    [
      { show: { id: 1, name: 'The Office', premiered: '2001-07-09', network: { country: { code: 'GB' } } } },
      { show: { id: 2, name: 'The Office', premiered: '2005-03-24', network: { country: { code: 'US' } } } },
    ],
    {
      name: 'The Office',
      first_air_date: '2005-03-24',
      origin_country: ['US'],
    }
  );

  assert.equal(result.reason, 'matched');
  assert.equal(result.match?.id, 2);
});

test('pickBestTvmazeShowMatch rejects ambiguous exact-title matches', () => {
  const result = pickBestTvmazeShowMatch(
    [
      { show: { id: 1, name: 'Ghosts' } },
      { show: { id: 2, name: 'Ghosts' } },
    ],
    {
      name: 'Ghosts',
      first_air_date: '',
      origin_country: [],
    }
  );

  assert.equal(result.reason, 'ambiguous-match');
  assert.equal(result.match, null);
});
