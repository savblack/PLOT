export function getEpisodeGuideState({
  currentEpisode = 0,
  currentSeason = 0,
  episodeNumber = 0,
  selectedSeason = 0,
}) {
  const isCurrent = selectedSeason === currentSeason && episodeNumber === currentEpisode;

  let isWatched = false;
  if (selectedSeason < currentSeason) {
    isWatched = true;
  } else if (selectedSeason === currentSeason) {
    isWatched = episodeNumber < currentEpisode;
  }

  return {
    isCurrent,
    isWatched,
    isActive: isWatched || isCurrent,
  };
}
