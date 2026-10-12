// US Eastern weekdays. Monday and Tuesday are the themed posts.
// Tuesday also keeps the mid question. The planner adds that question
// after the slate instead of opening the rest of Tuesday's mix.
export const ANCHOR_POST_BY_DAY = {
  Monday: 'trending',
  Tuesday: 'upcoming',
};

export const FIXED_FEATURE_BY_DAY = {
  Wednesday: 'watch_tonight',
  Saturday: 'hidden_gem',
};

export const QUESTION_SLOT_BY_DAY = {
  Tuesday: 'mid',
  Thursday: 'mid',
  Sunday: 'lead',
};

export const isAnchorDay = (weekday) => Boolean(ANCHOR_POST_BY_DAY[weekday]);
export const anchorPostForDay = (weekday) => ANCHOR_POST_BY_DAY[weekday] || null;
export const fixedFeatureForDay = (weekday) => FIXED_FEATURE_BY_DAY[weekday] || null;
export const questionSlotForDay = (weekday) => QUESTION_SLOT_BY_DAY[weekday] || null;
