/* Progress is a single pointer (current_season + current_episode), not a set of
   watched episodes: everything before the pointer counts as watched. A season
   is therefore fully watched when the pointer sits past its last episode, and
   marking one watched means moving the pointer to the next season's episode 1 —
   which necessarily marks every earlier season watched too. Unmarking pulls the
   pointer back to the season's first episode, which un-watches everything after
   it. Both are inherent to the pointer model, not choices this helper makes. */
export function getSeasonWatchState({
  currentEpisode = 0,
  currentSeason = 0,
  episodeCount = 0,
  selectedSeason = 0,
} = {}) {
  if (!episodeCount || !selectedSeason) {
    return { episodeCount: 0, watchedCount: 0, isComplete: false };
  }

  let watchedCount = 0;
  if (selectedSeason < currentSeason) {
    watchedCount = episodeCount;
  } else if (selectedSeason === currentSeason) {
    watchedCount = Math.min(Math.max(currentEpisode - 1, 0), episodeCount);
  }

  return { episodeCount, watchedCount, isComplete: watchedCount >= episodeCount };
}

/* Where the pointer lands when the season-level control is used. Marking rolls
   past the season; unmarking rewinds to its first episode. */
export function getSeasonToggleProgress({ isComplete = false, selectedSeason = 0 } = {}) {
  if (!selectedSeason || selectedSeason < 1) {
    return {
      ok: false,
      code: 'missing-season',
      error: 'Could not tell which season to update.',
    };
  }

  return isComplete
    ? { ok: true, nextSeason: selectedSeason, nextEpisode: 1 }
    : { ok: true, nextSeason: selectedSeason + 1, nextEpisode: 1 };
}

/* TMDB statuses that mean no further seasons are coming. Anything else
   ("Returning Series", "In Production", "Planned") means passing the last
   aired season only makes you up to date, not finished — the pointer parks at
   the next season and waits for it to air. */
const ENDED_TV_STATUSES = new Set(['Ended', 'Canceled', 'Cancelled']);

/* Highest real season number for a show. Season 0 is TMDB's specials bucket
   and never counts. Falls back to number_of_seasons when the season list
   hasn't loaded. */
export function getLastSeasonNumber(details) {
  const numbered = (details?.seasons || [])
    .map((s) => Number(s?.season_number))
    .filter((n) => Number.isInteger(n) && n > 0);
  if (numbered.length) return Math.max(...numbered);

  const count = Number(details?.number_of_seasons);
  return Number.isInteger(count) && count > 0 ? count : 0;
}

/* Whether landing the pointer on `nextSeason` means the whole series is done:
   the show has stopped producing seasons, and there is no season left to move
   into. Deliberately conservative — an unknown status or an unknown season
   count returns false, leaving the show in "currently watching" rather than
   retiring something the user is mid-way through. */
export function isSeriesComplete({ lastSeason = 0, nextSeason = 0, status = '' } = {}) {
  if (!lastSeason || !nextSeason) return false;
  if (!ENDED_TV_STATUSES.has(String(status))) return false;
  return nextSeason > lastSeason;
}

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
