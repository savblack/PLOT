// Copy for the share cards and the sheet that offers them. Shared by web and
// mobile so the image says the same thing wherever it was made.
// No em dashes in anything user-facing.

export const SHARE_CARDS = {
  // The sheet
  sheetTitle: 'Share a card',
  close: 'Close',
  post: 'Post',
  story: 'Story',
  previousCard: 'Previous card',
  nextCard: 'Next card',
  cardOf: (n, total) => `Card ${n} of ${total}`,
  caption: 'Caption',
  copyImage: 'Copy image',
  download: 'Download',
  shareToX: 'Share to X',
  shareToThreads: 'Share to Threads',
  instagramStory: 'Instagram Story',
  share: 'Share',
  working: 'Making the image',
  copied: 'Image copied. Paste it into your post.',
  copiedOnly: 'Image copied.',
  downloaded: 'Saved.',
  savedForStory: 'Saved. Add it to your story from Instagram.',
  openX: 'Open X',
  openThreads: 'Open Threads',
  failed: 'Could not make the image. Try again.',
  clipboardUnavailable: 'Your browser cannot copy images. Download it instead.',
  // Locked cards
  locked: 'Not yet',
  unlockTitles: (have, needed) => `Log ${needed} titles this year to unlock. ${have} of ${needed}.`,
  unlockStreak: (needed) => `Watch on ${needed} days in a row to unlock.`,
  unlockTop5: (have, needed) => `Pick ${needed} for your Top 5 to unlock. ${have} of ${needed}.`,
  // Entry points
  shareAsCard: 'Share as a card',
  shareACard: 'Share a card',
  loadingCards: 'Getting your cards ready',
  shareCardAria: (what) => `Share ${what} as a card`,
  // On the cards themselves
  site: 'theplot.tv',
  highlightsTitle: (year, isCurrentYear) => (isCurrentYear ? `Your ${year} so far` : `Your ${year}`),
  titlesWatched: 'titles watched',
  onScreen: 'on screen',
  topGenre: 'most watched genre',
  averageRating: 'average rating',
  streakTitle: 'Watch streak',
  days: 'DAYS',
  top5Title: (owner, kind) => `${owner ? `${owner} ` : ''}Top 5 ${kind === 'tv' ? 'TV series' : 'movies'}`,
  top5Short: (owner) => `${owner ? `${owner} ` : ''}Top 5`,
  kindMovies: 'Movies',
  kindTv: 'TV',
  // Captions: the post text, with the profile link at the end
  captions: {
    highlights: (card, url) => `${card.count} titles in ${card.year}${card.isCurrentYear ? ' so far' : ''}${card.genre ? `, mostly ${card.genre.toLowerCase()}` : ''}. ${url}`.trim(),
    streak: (card, url) => `${card.days}-day watch streak on PLOT. ${url}`.trim(),
    top5: (card, url) => `My Top 5 ${card.kind === 'tv' ? 'TV series' : 'films'} on PLOT. Follow me: ${url}`.trim(),
  },
};
