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
  create: 'Create smart list',
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
});
