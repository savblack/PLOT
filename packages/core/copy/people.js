/**
 * Following people (Premium): the follow controls on a title, a person's page,
 * the follow toast, the Home shelves, the Your people page and its entry
 * points. Release-day notification rows are worded in ./notifications.js.
 *
 * Neutral wording throughout: no pronouns for the person followed.
 */
export const PEOPLE = Object.freeze({
  follow: 'Follow',
  following: 'Following',
  unfollow: 'Unfollow',
  /** @param {string} name */
  followLabel: (name) => `Follow ${name}`,
  /** @param {string} name */
  followingLabel: (name) => `Following ${name}. Unfollow`,
  /** @param {string} name */
  viewLabel: (name) => `View ${name}`,
  explainer: 'Hear about new releases.',
  directedBy: 'Directed by',
  createdBy: 'Created by',
  director: 'Director',
  creator: 'Creator',
  error: 'Couldn’t update this. Try again.',

  person: Object.freeze({
    comingUp: 'Coming up',
    comingUpNote: 'dated work, soonest first',
    allCredits: 'All credits',
  }),

  toast: Object.freeze({
    /** @param {string} name @param {number | null} count */
    added: (name, count) => !count
      ? `${name} added. New work will show in Your people.`
      : `${name} added. ${count} upcoming ${count === 1 ? 'title is' : 'titles are'} in Your people.`,
    view: 'View',
    dismiss: 'Dismiss',
  }),

  chips: Object.freeze({
    outToday: 'Out today',
    inCinemas: 'In cinemas',
    newSeason: 'New season',
    dated: 'Dated',
  }),

  shelf: Object.freeze({
    title: 'Your people',
    /** @param {number} n */
    subtitle: (n) => `New and coming from the ${n} ${n === 1 ? 'person' : 'people'} you follow`,
    seeAll: 'See all',
    empty: 'Nothing new or dated from your people right now.',
    inviteSubtitle: 'Follow actors and directors to see their new work here',
    /** @param {number} n */
    actedIn: (n) => `In ${n} things you’ve watched`,
    /** @param {string} title */
    actedInOne: (title) => `In ${title}`,
    /** @param {number} n */
    directed: (n) => `Directed ${n} you’ve watched`,
    /** @param {string} title */
    directedOne: (title) => `Directed ${title}`,
  }),

  continueWatching: Object.freeze({
    title: 'Continue watching',
    subtitle: 'Episodes already out that you haven’t seen',
    /** @param {number} s @param {number} e */
    isOut: (s, e) => `S${s} · E${e} is out`,
    /** @param {number} s @param {number} e */
    next: (s, e) => `S${s} · E${e} next`,
  }),

  page: Object.freeze({
    title: 'Your people',
    subtitle: 'New and upcoming work from the people you follow',
    byDate: 'By date',
    byPerson: 'By person',
    followingTitle: 'Following',
    /** @param {number} n */
    peopleCount: (n) => `${n} ${n === 1 ? 'person' : 'people'}`,
    searchPlaceholder: 'Follow an actor or director',
    searchLabel: 'Search for an actor or director to follow',
    noResults: 'No one found.',
    outNow: 'Out now',
    /** @param {number} n */
    titleCount: (n) => `${n} ${n === 1 ? 'title' : 'titles'}`,
    empty: 'Follow an actor or director and their new work shows up here.',
    nothing: 'Nothing new or dated for these filters.',
    directing: 'directing',
    creating: 'creating',
    acting: 'Acting',
    directingDept: 'Directing',
    save: 'Save',
    saved: 'Saved',
    /** @param {number} s */
    season: (s) => `season ${s}`,
    weekly: 'Weekly',
    /** @param {number} n */
    allEpisodes: (n) => `All ${n} episodes`,
    /** @param {string} date */
    since: (date) => `Since ${date}`,
    /** @param {string} date */
    weeklySince: (date) => `Weekly since ${date}`,
  }),

  notificationsFooter: Object.freeze({
    body: 'People alerts arrive on release day only. Dates and what is coming next live on Your people.',
    link: 'Your people',
  }),

  settings: Object.freeze({
    label: 'People you follow',
    manage: 'Manage',
    /** @param {number} n */
    count: (n) => `${n}`,
  }),
});
