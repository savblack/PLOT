// Shim — the nav definition lives in @plot/core so web and mobile read one list.
// The one web addition: items behind a launch flag (`feature`) are dropped here
// until that feature ships, so the sidebar and drawer never link to a hidden route.
import { APP_NAV_ITEMS as CORE_NAV_ITEMS } from '@plot/core/navigation.js';
import { SHOW_WATCH_TOGETHER } from './launchFeatures.js';

export * from '@plot/core/navigation.js';

const FEATURES = { watchTogether: SHOW_WATCH_TOGETHER };

// Flagged items are never primary, so core's PRIMARY_NAV_ITEMS needs no filter.
export const APP_NAV_ITEMS = CORE_NAV_ITEMS.filter(item => !item.feature || FEATURES[item.feature]);
