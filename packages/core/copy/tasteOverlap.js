// Shared copy for taste overlap (Premium "Deeper viewing stats"): the compare
// page, the picker and the share card. Lives in @plot/core/copy so mobile uses
// the same words when it gets the screen.

/** @param {number} n @param {string} one @param {string} many */
const plural = (n, one, many) => `${n} ${n === 1 ? one : many}`;

export const TASTE_OVERLAP = {
  title: 'Taste overlap',
  premiumChip: 'Deeper stats · Premium',
  /** @param {string} name */
  youAnd: (name) => `You and ${name}`,
  changePerson: 'Change who you are comparing with',
  back: 'Back',

  matchKicker: 'Taste match',
  /** @param {number} n */
  basedOn: (n) => `Based on the ${plural(n, 'title', 'titles')} you have both rated.`,
  /** @param {number} n how many more shared ratings are needed */
  needMoreRatings: (n) => `Rate ${plural(n, 'more title', 'more titles')} you have both watched to see your match.`,
  titlesWatched: 'Titles watched',
  you: 'You',
  both: 'both',
  /** @param {number} mine @param {number} theirs @param {number} both @param {string} name */
  vennLabel: (mine, theirs, both, name) => `You watched ${plural(mine, 'title', 'titles')}, ${name} watched ${theirs}, ${both} of them both`,

  genres: 'Genres',
  noGenres: 'Not enough genre data yet.',
  yourDecade: 'Your decade',
  /** @param {number} decade */
  decade: (decade) => `${decade}s`,
  /** @param {string} name @param {number} decade */
  theirDecade: (name, decade) => `${name}’s is the ${decade}s`,
  /** @param {string} name */
  sameDecade: (name) => `${name}’s too`,
  noDecade: 'Not enough release dates yet',
  tougherCritic: 'Tougher critic',
  even: 'Even',
  /** @param {string} tougherAvg @param {string} otherAvg */
  theyAreTougher: (tougherAvg, otherAvg) => `${tougherAvg} vs your ${otherAvg} on average`,
  /** @param {string} name @param {string} mineAvg @param {string} theirAvg */
  youAreTougher: (name, mineAvg, theirAvg) => `${mineAvg} vs ${name}’s ${theirAvg} on average`,
  /** @param {string} avg */
  evenCritics: (avg) => `You both average ${avg} stars`,
  noCritic: 'Not enough ratings yet',

  bothLoved: 'You both loved',
  bothLovedEmpty: 'Nothing you have both rated 4 stars or more yet.',
  disagree: 'Where you disagree',
  disagreeEmpty: 'No titles rated two stars or more apart.',

  /** @param {number} n */
  watchlistOverlap: (n) => `${plural(n, 'title', 'titles')} on both your watchlists`,
  watchTogether: 'Choose one together in Watch together',

  share: 'Share your match',

  upsellTitle: 'Compare your taste with Premium',
  upsellBody: 'Taste overlap is part of Deeper viewing stats. See your match, the genres you share and where you disagree with anyone you follow.',
  notFound: 'This profile isn’t available.',
  /** @param {string} name */
  notVisible: (name) => `${name}’s profile is private. Once they accept your follow request, you can compare.`,
  failed: 'Couldn’t load your comparison.',
  retry: 'Try again',

  // Picker
  pickerTitle: 'Compare your taste',
  pickerIntro: 'Pick anyone you follow, or anyone with a public profile.',
  searchLabel: 'Search people',
  searchPlaceholder: 'Search by name or @username',
  peopleYouFollow: 'People you follow',
  searchResults: 'Search results',
  compare: 'Compare',
  requestPending: 'Request pending',
  privateProfile: 'Private profile',
  publicProfile: 'Public',
  privateApproved: 'Private, you’re approved',
  followNobody: 'Follow people to compare with them, or search for a public profile.',
  noResults: 'No one found.',
  privacyNote: 'Taste overlap only uses what they already show you on their profile: watch history and ratings. Private profiles need an accepted follow first.',

  // Entry points
  compareTaste: 'Compare taste',
  historyPromptTitle: 'Compare your taste',
  historyPromptBody: 'See how your ratings line up with someone you follow.',

  // Share card
  shareTitle: 'Share your match',
  theme: 'Theme',
  themes: { cream: 'Cream', pink: 'Pink', charcoal: 'Charcoal' },
  /** @param {string} name */
  showName: (name) => `Show ${name}’s name`,
  nameNeedsPublic: 'Names only appear for public profiles. Private profiles stay “a friend”.',
  nameAllowed: 'Their profile is public, so their name can go on the card.',
  /** @param {string} colourLower regional "color"/"colour" */
  cardColour: (colourLower) => `Card ${colourLower}`,
  me: 'Me',
  meAndFriend: 'Me and a friend',
  /** @param {string} name */
  meAnd: (name) => `Me and ${name}`,
  /** @param {number} n */
  watchedInCommon: (n) => `${plural(n, 'title', 'titles')} watched in common`,
  /** @param {number} n shown under the count when there's no match % yet */
  inCommonLabel: (n) => (n === 1 ? 'title watched in common' : 'titles watched in common'),
  weBothLoved: 'We both loved',
  /** @param {string} favouriteLower regional "favorite"/"favourite" */
  sharedGenre: (favouriteLower) => `Shared ${favouriteLower} genre`,
  biggestArgument: 'Biggest argument',
  cardFooter: 'Compare your taste on theplot.tv',
  shareImage: 'Share image',
  shareTo: 'Share to',
  networks: { instagram: 'Instagram', threads: 'Threads', x: 'X' },
  /** Instagram has no web share link, so the image is saved for the app. */
  instagramSaved: 'Image saved. Post it from the Instagram app.',
  /** @param {string} network */
  attachSaved: (network) => `Image saved. Attach it to your ${network} post.`,
  downloadImage: 'Download image',
  preparing: 'Preparing image',
  shareText: 'Our taste match on Plot',
  /** @param {number} pct */
  sharePostMatch: (pct) => `We're a ${pct}% taste match on Plot`,
  shareMenuLabel: 'Share your match to Instagram, Threads or X',
  /** @param {string} colourLower regional "color"/"colour" */
  changeCard: (colourLower) => `Change ${colourLower} or name`,
  close: 'Close',
};
