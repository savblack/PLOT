// Smart lists (Premium): lists that store rules and fill themselves.
// Shared by web and mobile. Era, score, length and services wording is Pick
// for Me's (copy/tonightPicker.js), since the rules are the same filters; read
// those from there rather than repeating them here.
import { TONIGHT_PICKER } from './tonightPicker.js';

export const SMART_LISTS = Object.freeze({
  newSmartList: 'New smart list',
  intro: 'Save the rules once. The list finds its own matches each time you open it.',
  nameLabel: 'List name',
  namePlaceholder: 'List name…',
  sourceLabel: 'Find titles from',
  sources: {
    discover: { label: 'New discoveries', hint: 'Anything that fits, saved or not' },
    watchlist: { label: TONIGHT_PICKER.summary.watchlist, hint: 'Titles you’ve saved' },
    history: { label: 'My history', hint: 'Titles you’ve watched' },
  },
  typeLabel: 'Type',
  types: { any: 'Movies and shows', movie: 'Movies', tv: 'Shows' },
  genresLabel: 'Genres',
  genresHint: 'Any of these. Leave them all off for every genre.',
  genreJoin: ' or ',
  genreCount: (n) => `${n} genres`,
  scoreSummary: (min) => `TMDB ${min}+`,
  lengthLabel: 'Length',
  myRatingLabel: 'My rating',
  myRating: (rating) => (rating ? `${rating / 2}+ stars` : 'Any'),
  hideWatched: 'Leave out what I’ve watched',
  create: TONIGHT_PICKER.createSmartList,
  creating: 'Creating…',
  couldNotSave: 'Could not save this smart list. Please try again.',
  badge: 'Smart',
  coverCount: 'Smart list',
  editRules: 'Edit rules',
  empty: 'Nothing matches these rules yet. Try loosening one.',
  loadFailed: 'Could not load matches right now.',
  retry: 'Try again',
  loadMore: 'Show more',
  unchecked: (n) => `${n} older ${n === 1 ? 'title was' : 'titles were'} not checked for score, length or services.`,
  lockedTitle: 'This smart list needs Premium',
  lockedBody: 'Your rules are saved. Upgrade to see what they find.',
  lockedAction: 'See Premium',

  // The rules as one sentence of chips (B3, and the builder in A2 and the
  // phone save sheet): "Find [shows] from [new discoveries] that are
  // [Drama or Crime,] [rated 7+,] [on my services.]". Each chip is a rule;
  // punctuation is added in code so a removed rule takes its comma with it.
  sentence: {
    find: 'Find',
    from: 'from',
    thatAre: 'that are',
    types: { any: 'movies and shows', movie: 'movies', tv: 'shows' },
    sources: { discover: 'new discoveries', watchlist: 'my watchlist', history: 'my history' },
    myRating: (rating) => `I rated ${rating / 2}+ stars`,
  },
  addRule: 'Add a rule',
  removeRule: 'Remove this rule',
  ruleMenu: (label) => `Change ${label.toLowerCase()}`,
  tapHint: 'Tap a rule to change it',
  matchCount: (n) => `${n} ${n === 1 ? 'match' : 'matches'}`,

  // A2: naming step. From Pick for Me the title is the button's own words
  // the same as from My Lists: newSmartList.
  fromAnswersIntro: 'Plot saves your answers, not these five picks. Each time you open the list it looks again, so new matches turn up on their own.',
  rulesFromAnswers: 'Rules, from your answers',
  rulesLabel: 'Rules',
  liveCount: (n) => `${n} ${n === 1 ? 'match' : 'matches'} right now`,
  liveCountSource: 'from everything on TMDB',
  counting: 'Counting matches…',
  countFailed: 'Could not count matches right now.',
  created: 'Smart list created',
  // Names written from the rules: "Thriller and mystery movies, under 2 hours, on my services".
  nameGenreJoin: ' and ',

  // B1: "New list" asks which kind.
  kinds: {
    list: { title: 'List', body: 'Add titles yourself, one at a time' },
    smart: { title: 'Smart list', body: 'Set a few rules. It finds the titles and keeps looking.' },
  },

  // A4: coming back. New matches since the list was last opened lead.
  newSince: 'New since you last looked',
  sinceDate: (date) => `since ${date}`,
  // Same words as NOTIFICATIONS_PAGE.everythingElse, a different concept (the
  // rest of one list's matches, not the rest of the feed): kept apart on purpose.
  everythingElse: 'Everything else',
  lastOpened: (date) => `Last opened ${date}`,
  newCount: (n) => `${n} new`,
});
