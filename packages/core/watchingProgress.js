export function getNextEpisodeProgress(progress, season) {
  if (!progress) {
    return {
      ok: false,
      code: 'missing-progress',
      error: 'Could not find your current episode progress.',
    };
  }

  const episodeCount = season?.episodes?.length || progress.total_episodes;
  if (!episodeCount) {
    return {
      ok: false,
      code: 'missing-season-data',
      error: 'Could not load this season right now. Try again in a moment.',
    };
  }

  let nextSeason = progress.current_season;
  let nextEpisode = progress.current_episode + 1;

  if (nextEpisode > episodeCount) {
    nextSeason = progress.current_season + 1;
    nextEpisode = 1;
  }

  return {
    ok: true,
    nextSeason,
    nextEpisode,
    episodeCount,
  };
}
