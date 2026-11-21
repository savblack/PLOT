// Copy for the Insights page (web and mobile). The numbers and the rules for
// which sentence applies live in packages/core/insights.js.

const plural = (n, one, many) => `${n} ${n === 1 ? one : many}`;
const perWeek = (n) => (n >= 10 ? Math.round(n) : Math.round(n * 10) / 10);

export const INSIGHTS_VIEW = {
  title: 'Insights',
  intro: 'Worked out from what you log. Updates every time you add something.',
  periods: { month: 'This month', year: 'This year', all: 'All time' },
  periodLabel: 'Period',
  lockedPeriod: (label) => `${label} is part of Premium`,

  // Lately: a plain read of the last 30 days, replacing the mockup's
  // "character" (Savannah, 21 Nov 2026: say what the habits are, don't name them).
  latelyHeading: 'Lately',
  latelyNote: 'Your last 30 days',
  latelyNotEnough: 'Log a few more titles and this sums up how you’ve been watching.',
  latelyMostly: (genre) => `mostly ${genre.toLowerCase()}`,
  latelyALotOf: (genre) => `a lot of ${genre.toLowerCase()}`,
  latelyMixOfGenres: 'a real mix of genres',
  latelyWeekends: 'mostly on weekends',
  latelyWeeknights: 'mostly on weeknights',
  latelyOnDay: (day) => `often on ${day}s`,
  latelyMoreShows: 'more shows than movies',
  latelyMoreMovies: 'more movies than shows',
  latelyEvenMix: 'an even mix of movies and shows',

  usualHeading: 'Compared with your usual',
  usualSame: 'Much the same as your usual.',
  shiftMoreGenre: (genre) => `More ${genre.toLowerCase()} than usual`,
  shiftLessGenre: (genre) => `Less ${genre.toLowerCase()} than usual`,
  shiftMoreShows: 'More shows than usual',
  shiftMoreMovies: 'More movies than usual',
  shiftMorePace: (now, usual) => `Watching more than usual: ${perWeek(now)} a week, usually ${perWeek(usual)}`,
  shiftLessPace: (now, usual) => `Watching less than usual: ${perWeek(now)} a week, usually ${perWeek(usual)}`,

  statTitles: 'titles',
  statMovies: 'in movies',
  statNight: 'your night',
  statStreak: 'best streak',
  streakDays: (n) => plural(n, 'day', 'days'),
  vsLastYearTitles: (n) => `${n > 0 ? '+' : ''}${n} on last year`,
  vsLastYearStars: (n) => `${n > 0 ? '+' : ''}${n} stars on last year`,
  averageStars: 'your average',

  highestHeading: 'Highest rated',
  highestNote: 'Ranked by your ratings. Moves as you rate.',
  highestEmpty: 'Rate a few titles and your highest rated show up here.',
  moveNew: 'New',
  moveUp: (n) => `Up ${n}`,
  moveDown: (n) => `Down ${n}`,

  onThisDayHeading: 'On this day',
  onThisDayLine: (yearsAgo, year) => (yearsAgo === 1 ? `A year ago, in ${year}` : `${yearsAgo} years ago, in ${year}`),

  hotTakesHeading: 'Your hot takes',
  hotTakesNote: 'Where you and TMDB’s audience disagree by a star or more.',
  hotTakesEmpty: 'No big disagreements with the crowd here.',
  hotTakeYou: (stars) => `You ${stars}★`,
  hotTakeCrowd: (stars) => `Crowd ${stars}★`,

  weekdaysHeading: 'Which days you watch',
  weekdaysNote: 'By the date you logged. Many entries have no time of day, so this sticks to days.',
  weekdayShort: ['S', 'M', 'T', 'W', 'T', 'F', 'S'],
  weekdayCount: (day, n) => `${day}: ${plural(n, 'title', 'titles')}`,

  lastYearHeading: 'Against last year',
  morePeopleHeading: 'More people you keep coming back to',

  premiumHeading: 'More with Premium',
  premiumIntro: 'Already worked out from your history. Premium shows the details.',
  teaseUsual: (n) => `${plural(n, 'change', 'changes')} from your usual in the last 30 days.`,
  teaseHotTakes: (n) => `${plural(n, 'title', 'titles')} where you and the crowd disagree by a star or more.`,
  teaseLastYear: (year) => `See how this compares with the same stretch of ${year}.`,
  teaseMorePeople: (n) => `${plural(n, 'more person', 'more people')} who keep turning up in what you watch.`,
  teaseWeekdays: 'Every day of the week, not just your night.',
  teaseAllTime: (n, year) => `${plural(n, 'title', 'titles')} since ${year}.`,

  emptyTitle: 'Nothing to work out yet',
  emptyBody: 'Insights come from your history. Mark a few titles as watched and they start to appear.',
  emptyPeriod: 'Nothing logged in this period yet.',
  loading: 'Working it out',
};
