export function getEpisodeGuideState({
  currentEpisode = 0,
  currentSeason = 0,
  episodeNumber = 0,
  selectedSeason = 0,
  episodeStates = {},
}) {


  let isWatched = false;
  if (selectedSeason > 0 && selectedSeason < currentSeason) {
    isWatched = true;
  } else if (selectedSeason === currentSeason) {
    isWatched = episodeNumber < currentEpisode;
  }

  const explicit = episodeStates[`${selectedSeason}:${episodeNumber}`];
  if (typeof explicit === 'boolean') isWatched = explicit;
  const isCurrent = !isWatched && selectedSeason === currentSeason && episodeNumber === currentEpisode;

  return {
    isCurrent,
    isWatched,
    isActive: isWatched || isCurrent,
  };
}
