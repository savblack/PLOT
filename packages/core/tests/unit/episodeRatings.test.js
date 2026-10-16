import assert from 'node:assert/strict';
import test from 'node:test';

import {
  episodeRatingSeasonNumbers,
  episodeRatingStory,
  episodeRatingSummary,
  formatEpisodeScore,
  formatVoteCount,
  gridForSource,
  gridFromSeasonPayloads,
  loadTmdbEpisodeGrid,
  personalScoresFromRows,
  ratingBand,
  scoredValue,
} from '../../episodeRatings.js';

const finale = [
  { episode_number: 1, name: 'Winterfell', vote_average: 7.6, vote_count: 100 },
  { episode_number: 2, name: 'A Knight of the Seven Kingdoms', vote_average: 7.9, vote_count: 90 },
  { episode_number: 3, name: 'The Long Night', vote_average: 7.5, vote_count: 200 },
  { episode_number: 4, name: 'The Last of the Starks', vote_average: 5.5, vote_count: 180 },
  { episode_number: 5, name: 'The Bells', vote_average: 6.0, vote_count: 220 },
  { episode_number: 6, name: 'The Iron Throne', vote_average: 4.0, vote_count: 400 },
];

test('scoredValue ignores an average nobody voted for', () => {
  assert.equal(scoredValue(0, 0), null);
  assert.equal(scoredValue(8.64, 12), 8.6);
  assert.equal(scoredValue(8.6, undefined), 8.6);
});

test('rating bands follow the sheet scale', () => {
  assert.equal(ratingBand(null), 'empty');
  assert.equal(ratingBand(9), 'peak');
  assert.equal(ratingBand(8.6), 'good');
  assert.equal(ratingBand(7.5), 'fine');
  assert.equal(ratingBand(6), 'soft');
  assert.equal(ratingBand(4), 'fall');
});

test('scores format to one decimal for TMDB and whole numbers for yours', () => {
  assert.equal(formatEpisodeScore(9, 'tmdb'), '9.0');
  assert.equal(formatEpisodeScore(8, 'yours'), '8');
  assert.equal(formatEpisodeScore(7.5, 'yours'), '7.5');
  assert.equal(formatVoteCount(82000), '82k');
  assert.equal(formatVoteCount(1500000), '1.5m');
  assert.equal(formatVoteCount(40), '40');
});

test('the grid keeps numbered seasons and drops an unscored episode', () => {
  const grid = gridFromSeasonPayloads([
    { season_number: 0, episodes: [{ episode_number: 1, name: 'Special', vote_average: 8, vote_count: 10 }] },
    { season_number: 3, episodes: [] },
    { season_number: 2, episodes: [{ episode_number: 1, name: 'Two', vote_average: 8.2, vote_count: 10 }] },
    {
      season_number: 1,
      episodes: [
        { episode_number: 2, name: 'Later', vote_average: 9.1, vote_count: 10 },
        { episode_number: 1, name: 'Pilot', vote_average: 0, vote_count: 0 },
        { episode_number: 2, name: 'Duplicate', vote_average: 1, vote_count: 10 },
      ],
    },
  ]);
  assert.deepEqual(grid.map(season => season.seasonNumber), [1, 2, 3]);
  assert.deepEqual(grid[0].episodes.map(episode => [episode.episodeNumber, episode.score, episode.name]), [
    [1, null, 'Pilot'],
    [2, 9.1, 'Later'],
  ]);
});

test('a missing season fails the load instead of leaving a hole', async () => {
  await assert.rejects(
    loadTmdbEpisodeGrid(1, [1, 2], async (_id, season) => (season === 1 ? { season_number: 1, episodes: [] } : null)),
    /Could not load episode ratings/,
  );
  const grid = await loadTmdbEpisodeGrid(1, [8], async () => ({ season_number: 8, episodes: finale }));
  assert.equal(grid[0].episodes[5].name, 'The Iron Throne');
  const placed = await loadTmdbEpisodeGrid(1, [4], async () => ({ episodes: [] }));
  assert.deepEqual(placed, [{ seasonNumber: 4, episodes: [] }]);
});

test('the story names the season that holds and the later low point', () => {
  const grid = gridFromSeasonPayloads([
    { season_number: 7, episodes: [{ episode_number: 1, name: 'Dragonstone', vote_average: 8.5, vote_count: 10 }] },
    { season_number: 8, episodes: finale },
  ]);
  const story = episodeRatingStory(grid);
  assert.equal(story.kind, 'holds');
  assert.equal(story.holdThrough, 3);
  assert.equal(story.low.episodeNumber, 6);
  assert.equal(story.low.score, 4);
  assert.equal(story.total, 7);
  assert.equal(story.rated, 7);
  assert.equal(
    episodeRatingSummary(story, 'tmdb').story,
    'Season 8 holds through episode 3. The low point is episode 6, at 4.0.',
  );
});

test('a show that never drops names its lowest episode', () => {
  const story = episodeRatingStory(gridFromSeasonPayloads([
    { season_number: 1, episodes: [
      { episode_number: 1, name: 'A', vote_average: 8.0, vote_count: 4 },
      { episode_number: 2, name: 'B', vote_average: 8.0, vote_count: 4 },
    ] },
  ]));
  assert.equal(story.kind, 'low');
  assert.equal(story.holdThrough, null);
  assert.equal(story.low.episodeNumber, 2);
});

test('a season that opens low does not claim it held', () => {
  const story = episodeRatingStory(gridFromSeasonPayloads([
    { season_number: 1, episodes: [{ episode_number: 1, name: 'A', vote_average: 4, vote_count: 4 }] },
  ]));
  assert.equal(story.kind, 'low');
  assert.equal(story.holdThrough, null);
});

test('your scores replace the audience scores and leave the rest empty', () => {
  const grid = gridFromSeasonPayloads([{ season_number: 8, episodes: finale }]);
  const yours = gridForSource(grid, { '8:6': 2, '8:1': 8 }, 'yours');
  assert.equal(yours[0].episodes[0].score, 8);
  assert.equal(yours[0].episodes[0].voteCount, null);
  assert.equal(yours[0].episodes[5].score, 2);
  assert.equal(yours[0].episodes[1].score, null);
  const story = episodeRatingStory(yours);
  assert.equal(story.rated, 2);
  assert.equal(story.total, 6);
  assert.equal(story.low.score, 2);
  const summary = episodeRatingSummary(story, 'yours');
  assert.equal(summary.story, 'Season 8 holds through episode 1. Your low point is episode 6, at 2.');
  assert.equal(summary.rated, "You've rated 2 of 6 episodes.");
});

test('annotations replace watch-event scores for the same episode', () => {
  const scores = personalScoresFromRows({
    events: [
      { season_number: 1, episode_number: 1, source_rating: 6, created_at: '2024-01-01' },
      { season_number: 1, episode_number: 2, source_rating: 0, created_at: '2024-01-02' },
      { season_number: 1, episode_number: 3, source_rating: 9, created_at: '2024-01-01' },
      { season_number: 1, episode_number: 3, source_rating: 7, created_at: '2024-06-01' },
    ],
    annotations: [
      { season_number: 1, episode_number: 1, imported_at: '2024-02-01', annotation: { kind: 'rating', rating: 10 } },
      { season_number: 1, episode_number: 4, imported_at: '2024-02-01', annotation: { kind: 'review', rating: 1 } },
      { season_number: 0, episode_number: 1, imported_at: '2024-02-01', annotation: { kind: 'rating', rating: 8 } },
    ],
  });
  assert.equal(scores['1:1'], 10);
  assert.equal(scores['1:2'], undefined);
  assert.equal(scores['1:3'], 7);
  assert.equal(scores['1:4'], undefined);
  assert.equal(scores['0:1'], undefined);
});

test('season numbers skip specials and empty seasons', () => {
  assert.deepEqual(episodeRatingSeasonNumbers({
    seasons: [
      { season_number: 0, episode_count: 4 },
      { season_number: 1, episode_count: 10 },
      { season_number: 2, episode_count: 0 },
      { season_number: 3, episode_count: 6 },
    ],
  }), [1, 3]);
});
