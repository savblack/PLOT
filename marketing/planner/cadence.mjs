// US Eastern weekdays.
//
// Question posts are off. The conversation trigger, brief, and renderer stay
// in the tree. QUESTIONS_ENABLED is the switch. While it is false the planner
// does not insert a question row, and render and Buffer both refuse one.
export const QUESTIONS_ENABLED = false;

const QUESTION_SLOTS_WHEN_ENABLED = {
  Tuesday: 'mid',
  Thursday: 'mid',
  Sunday: 'lead',
};

export const QUESTION_SLOT_BY_DAY = QUESTIONS_ENABLED ? QUESTION_SLOTS_WHEN_ENABLED : {};

// One themed post when the chain finds a candidate. An empty chain falls
// through to the fill mix in plan.mjs. Countdown means T-1, then T-7, then T-14.
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

export const isAnchorDay = (weekday) => (ANCHOR_CHAIN_BY_DAY[weekday] || []).length > 0;
export const anchorChainForDay = (weekday) => ANCHOR_CHAIN_BY_DAY[weekday] || [];
export const anchorPostForDay = (weekday) => anchorChainForDay(weekday)[0] || null;
export const fixedFeatureForDay = (weekday) => FIXED_FEATURE_BY_DAY[weekday] || null;
export const questionSlotForDay = (weekday) => (
  QUESTIONS_ENABLED ? (QUESTION_SLOTS_WHEN_ENABLED[weekday] || null) : null
);

export const postTypeShips = (postType) => postType !== 'question' || QUESTIONS_ENABLED;
