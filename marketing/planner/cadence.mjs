// US Eastern weekdays.
// Monday and Tuesday are themed posts. Tuesday also keeps the mid question.
// Thursday, Friday, and Sunday each guarantee a non-question post: the chain
// is tried first, and an empty chain falls through to the fill mix.
// Countdown means T-1, then T-7, then T-14.
// Questions stay where they were: Tuesday and Thursday mid, Sunday lead.
export const ANCHOR_CHAIN_BY_DAY = {
  Monday: ['trending'],
  Tuesday: ['upcoming'],
  Thursday: ['trailer', 'countdown'],
  Friday: ['now_streaming'],
  Sunday: ['on_this_day'],
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

export const isAnchorDay = (weekday) => (ANCHOR_CHAIN_BY_DAY[weekday] || []).length > 0;
export const anchorChainForDay = (weekday) => ANCHOR_CHAIN_BY_DAY[weekday] || [];
export const anchorPostForDay = (weekday) => anchorChainForDay(weekday)[0] || null;
export const fixedFeatureForDay = (weekday) => FIXED_FEATURE_BY_DAY[weekday] || null;
export const questionSlotForDay = (weekday) => QUESTION_SLOT_BY_DAY[weekday] || null;
