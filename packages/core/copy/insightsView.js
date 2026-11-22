// Copy for the Insights page (web and mobile). The numbers and the rules for
// which sentence applies live in packages/core/insights.js.
//
// Savannah, 21 Nov 2026: no body copy at the top of the page, labels over
// explanations, and anything empty is an action rather than a message.

const plural = (n, one, many) => `${n} ${n === 1 ? one : many}`;
const perWeek = (n) => (n >= 10 ? Math.round(n) : Math.round(n * 10) / 10);

export const INSIGHTS_VIEW = {
  title: 'Insights',
  periods: { month: 'This month', all: 'All time' },
  /** The year chip reads as the year itself ("2026"). */
  yearChip: (year) => String(year),
  periodLabel: 'Period',
  lockedPeriod: (label) => `${label}, part of Premium`,

  // Watching type: a name for how you've been watching, always shown with the
  // facts that earned it.
  typeHeading: 'How you watch right now',
  typeHeadingYear: (year) => `How you watched in ${year}`,
  typeName: (id, genre) => (id === 'devotee' && genre ? `The ${genre} Devotee` : TYPE_NAMES[id] ?? TYPE_NAMES.allRounder),
  typeLine: {
    binger: 'Once a show has you, the next episode is already playing.',
    devotee: 'You know what you like, and you go back for more of it.',
    critic: 'You rate harder than the crowd. A five from you means something.',
    champion: 'You find the good in things the crowd shrugs at.',
    rewatcher: 'You know exactly what you need, because you’ve seen it before.',
    weekender: 'Weeknights are for life. Weekends are for watching.',
    editor: 'Life’s short. If it isn’t working, you stop.',
    filmBuff: 'Give you a movie over a series, nearly every time.',
    explorer: 'No favorite genre, because you want to try them all.',
    allRounder: 'A bit of everything, no rut in sight.',
  },
  reasonShows: (pct) => `${pct} of it shows`,
  reasonMovies: (pct) => `${pct} of it movies`,
  reasonPace: (n) => `${n} titles a week`,
  reasonGenre: (genre, pct) => `${genre} in ${pct} of what you watched`,
  reasonTougher: (n) => `${n} stars tougher than the crowd`,
  reasonKinder: (n) => `${n} stars kinder than the crowd`,
  reasonRewatches: (n) => plural(n, 'rewatch', 'rewatches'),
  reasonWeekends: (pct) => `${pct} on weekends`,
  reasonDnf: (n) => `${n} you didn’t finish`,
  reasonGenres: (n) => `${n} different genres`,
  lastMonth: (name) => `Last month: ${name}`,
  typeMonths: 'Your last six months',
  typeLocked: 'Log 5 titles to find out yours',

  statTitles: 'titles',
  statMovies: 'in movies',
  statNight: 'your night',
  statStreak: 'best streak',
  streakDays: (n) => plural(n, 'day', 'days'),
  vsLastYearTitles: (n) => `${n > 0 ? '+' : ''}${n} on last year`,
  vsLastYearStars: (n) => `${n > 0 ? '+' : ''}${n} on last year`,
  averageStars: 'your average',

  highestHeading: 'Highest rated',
  moveNew: 'New',
  moveUp: (n) => `Up ${n}`,
  moveDown: (n) => `Down ${n}`,

  onThisDayHeading: 'On this day',
  onThisDayLine: (yearsAgo, year) => (yearsAgo === 1 ? `A year ago, in ${year}` : `${yearsAgo} years ago, in ${year}`),

  usualHeading: 'Compared with your usual',
  usualSame: 'Much the same as your usual.',
  shiftMoreGenre: (genre) => `More ${genre.toLowerCase()} than usual`,
  shiftLessGenre: (genre) => `Less ${genre.toLowerCase()} than usual`,
  shiftMoreShows: 'More shows than usual',
  shiftMoreMovies: 'More movies than usual',
  shiftMorePace: (now, usual) => `Watching more than usual: ${perWeek(now)} a week, usually ${perWeek(usual)}`,
  shiftLessPace: (now, usual) => `Watching less than usual: ${perWeek(now)} a week, usually ${perWeek(usual)}`,

  hotTakesHeading: 'Your hot takes',
  hotTakeYou: (stars) => `You ${stars}★`,
  hotTakeCrowd: (stars) => `Crowd ${stars}★`,

  weekdaysHeading: 'Which days you watch',
  weekdayShort: ['S', 'M', 'T', 'W', 'T', 'F', 'S'],
  weekdayCount: (day, n) => `${day}: ${plural(n, 'title', 'titles')}`,

  // Samples: what Free sees in Premium's place, and an empty account sees
  // everywhere. Always tagged.
  sample: 'Sample',
  samplePremium: 'Sample · Premium',

  // Actions in place of empty messages.
  startTitle: 'Your insights start with one title',
  findTitle: 'Find a title',
  importFrom: (name) => `Import from ${name}`,
  logMore: 'Log something you watched',
  rateSome: 'Rate what you’ve watched',
  periodEmpty: (label) => `Nothing logged for ${label.toLowerCase()} yet`,
  loading: 'Working it out',
};

const TYPE_NAMES = {
  binger: 'The Binger',
  devotee: 'The Devotee',
  critic: 'The Tough Critic',
  champion: 'The Champion',
  rewatcher: 'The Comfort Rewatcher',
  weekender: 'The Weekend Watcher',
  editor: 'The Ruthless Editor',
  filmBuff: 'The Film Buff',
  explorer: 'The Explorer',
  allRounder: 'The All-Rounder',
};
