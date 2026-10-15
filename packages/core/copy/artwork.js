// Shared by the web and mobile artwork sheets.

export const ARTWORK = {
  customize: 'Customize artwork',
  posters: 'Posters',
  backdrops: 'Backdrops',
  logos: 'Logos',
  photos: 'Photos',
  seasonPosters: (season) => (Number(season) === 0 ? 'Specials posters' : `Season ${season} posters`),
  useDefault: 'Use the default',
  premiumTitle: 'Plot Premium',
  premiumBody: 'Custom artwork is part of Plot Premium.',
  couldNotSave: 'Could not save this artwork. Try again.',
  couldNotLoad: 'Could not load artwork. Try again.',
  empty: 'No other artwork is available.',
};
