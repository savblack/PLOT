// Shim — the nav definition lives in @plot/core so web and mobile read one list.
// The one web addition: items behind a launch flag (`feature`) are dropped here
// until that feature ships, so the sidebar and drawer never link to a hidden route.
import { APP_NAV_ITEMS as CORE_NAV_ITEMS } from '@plot/core/navigation.js';
import { SIDEBAR_FIXED_FIRST, orderSidebarItems } from '@plot/core/uiPrefs.js';
import { SHOW_WATCH_TOGETHER } from './launchFeatures.js';

export * from '@plot/core/navigation.js';

const FEATURES = { watchTogether: SHOW_WATCH_TOGETHER };

// Flagged items are never primary, so core's PRIMARY_NAV_ITEMS needs no filter.
export const APP_NAV_ITEMS = CORE_NAV_ITEMS.filter(item => !item.feature || FEATURES[item.feature]);

// The desktop rail. Search leads, and Settings is not in it (it lives in the
// account menu). `sidebarNavItems` applies the viewer's saved order, which
// only moves the middle (see @plot/core/uiPrefs.js).
const SIDEBAR_BASE_ITEMS = [
  APP_NAV_ITEMS.find(item => item.id === 'search'),
  ...APP_NAV_ITEMS.filter(item => item.id !== 'settings' && item.id !== 'search'),
];
/** @param {string[] | undefined} order saved ui_prefs.sidebar */
export const sidebarNavItems = (order) => orderSidebarItems(SIDEBAR_BASE_ITEMS, order);
/** The items the viewer can move, in their current order (everything but the fixed Search). */
export const movableSidebarItems = (order) => sidebarNavItems(order).filter(item => !SIDEBAR_FIXED_FIRST.includes(item.id));
