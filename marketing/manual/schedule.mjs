// The weekly content calendar for the manual flow. One source of truth for
// which post types run on which day, and how each type behaves.
//
//   render  — build.mjs renders its card from the planner payload at build time
//   feed    — eligible for theplot.tv/whats-on (an existing marketing_posts type)
//   card    — 'title': media.mjs renders a feature card for the title the agent
//             names in the Card block. Types with no card mode are text-only
//             (no image at all).
//   kicker  — the accent caps label printed on a 'title' card image
export const TYPES = {
  weekly_slate:          { label: 'Upcoming this week',     render: true,  feed: true },
  trending_chart:        { label: 'Trending top 10',        render: true,  feed: true },
  on_this_day:           { label: 'Anniversary',            render: true,  feed: true },
  countdown:             { label: 'Countdown',              render: true,  feed: true },
  spotlight:             { label: 'Spotlight',              feed: false, card: 'title', kicker: 'Spotlight' },
  hidden_gem:            { label: 'Hidden gem',             feed: false, card: 'title', kicker: 'Hidden gem' },
  what_to_watch_tonight: { label: 'What to watch tonight',  feed: false, card: 'title', kicker: 'Tonight on PLOT' },
  text_question:         { label: 'Text question',          feed: false },  // text-only, no image
  question_of_week:      { label: 'Question of the week',   feed: false },  // text-only, no image
};

// Ordered so the most "featured" post is first (build.mjs sorts it newest).
export const SCHEDULE = {
  Monday:    ['weekly_slate'],
  Tuesday:   ['on_this_day', 'spotlight', 'text_question', 'countdown'],
  Wednesday: ['what_to_watch_tonight', 'on_this_day', 'spotlight', 'countdown'],
  Thursday:  ['on_this_day', 'spotlight', 'text_question', 'countdown'],
  Friday:    ['trending_chart'],
  Saturday:  ['hidden_gem', 'on_this_day', 'spotlight', 'countdown'],
  Sunday:    ['question_of_week', 'on_this_day', 'spotlight', 'countdown'],
};

export const CTA = {
  weekly_slate: 'whats_on_tonight',
  trending_chart: 'journal_it',
  on_this_day: 'journal_it',
  countdown: 'track_it',
  spotlight: 'journal_it',
  hidden_gem: 'journal_it',
  what_to_watch_tonight: 'whats_on_tonight',
  text_question: 'none',
  question_of_week: 'none',
};

// Weekday name (UTC) for a YYYY-MM-DD string — the day the flow is run for.
export const weekdayOf = (date) =>
  ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'][
    new Date(`${date}T00:00:00Z`).getUTCDay()
  ];
