import { WATCH_TOGETHER } from './copy/watchTogether.js';
import { PEOPLE } from './copy/people.js';
import { FAVOURITES_ENABLED } from './features.js';

export const APP_NAV_ITEMS = [
  { id: 'home', label: 'Home', path: '/home', primary: true },
  { id: 'calendar', label: 'Calendar', path: '/calendar', primary: true },
  { id: 'my-lists', label: 'My Lists', path: '/my-lists', primary: true },
  // Own page on web. Mobile keeps the My Lists tab and also opens this from
  // the drawer and the tab bar. MY_LISTS_TABS below keeps its 'history' entry.
  { id: 'history', label: 'History', path: '/history', primary: true },
  // Own nav item on web and mobile (opened from the drawer). Not primary, so it
  // stays out of the tab bar.
  { id: 'guide', label: 'Guide', path: '/guide', primary: false },
  // Pick for Me, the tonight picker (Premium). Free viewers land on the Premium gate,
  // never on fake results. Mobile lists it in its drawer (DrawerMenu.tsx).
  { id: 'tonight', label: 'Pick for Me', path: '/tonight', primary: false, premium: true },
  // Watch together. On for web and mobile (SHOW_WATCH_TOGETHER, PLO-515).
  // `feature` still lets an app hide it. The Premium mark stays: deciding
  // together needs Premium on at least one side.
  { id: 'together', label: WATCH_TOGETHER.navLabel, path: '/together', primary: false, premium: true, feature: 'watchTogether' },
  { id: 'search', label: 'Search', path: '/search', primary: false },
  { id: 'settings', label: 'Settings', path: '/settings', primary: false },
];

export const PRIMARY_NAV_ITEMS = APP_NAV_ITEMS.filter(item => item.primary);

export const VIEW_TITLES = APP_NAV_ITEMS.reduce(
  (titles, item) => ({ ...titles, [item.id]: item.id === 'home' ? 'plot' : item.label }),
  {
    'new-releases': 'New Releases',
    'design-system': 'Design System',
    requests: 'Follow requests',
    notifications: 'Notifications',
    // No sidebar item yet (round 2 decision): reached from Home, the follow
    // toast, Notifications, a person's page and Settings.
    'your-people': PEOPLE.page.title,
    import: 'Import',
    // The taste overlap picker. Without an entry it fell through to the brand.
    compare: 'Compare',
    // Keyed on the first segment: viewFromPath returns `person/<id>`, and the
    // page shows the person's own name, so the chrome only needs to say where
    // you are.
    person: 'Talent',
  },
);

/**
 * Title for a view id, falling back to the first path segment so dynamic
 * routes (`person/4110`) resolve, and to the brand for anything unknown.
 *
 * WHY: /person/:id and /import had no entry, so both fell through to the brand
 * and rendered a second "Plot" wordmark in the content column, directly beside
 * the one the sidebar already shows.
 *
 * @param {string} view
 * @returns {string}
 */
export function titleForView(view) {
  if (!view) return VIEW_TITLES.home;
  return VIEW_TITLES[view] ?? VIEW_TITLES[view.split('/')[0]] ?? VIEW_TITLES.home;
}

/**
 * Whether a nav item should read as active for the current view. A nested
 * page keeps its parent lit: `/my-lists/want` is still My Lists.
 *
 * @param {string} view
 * @param {string} id
 */
export function isActiveView(view, id) {
  return view === id || (view || '').startsWith(`${id}/`);
}

export function pathForView(view) {
  return APP_NAV_ITEMS.find(item => item.id === view)?.path ?? `/${view}`;
}

export function viewFromPath(pathname) {
  const path = pathname.replace(/\/+$/, '') || '/home';
  const fallbackView = path.replace(/^\//, '') || 'home';
  const navItem = APP_NAV_ITEMS.find(item => item.path === path);
  return navItem?.id ?? fallbackView;
}

/* Sub-tabs nested under My Lists on MOBILE. Web no longer has them: My Lists
   is one scroll of every list and History has its own route (/history). */
export const MY_LISTS_TABS = [
  { id: 'all',       label: 'All'           },
  { id: 'watching',  label: 'Watching'      },
  { id: 'want',      label: 'Want to Watch' },
  { id: 'top10',     label: 'Top 5'         },
  { id: 'favorites', label: null            }, // region-spelled at the call site
  { id: 'lists',     label: 'Lists'         },
  { id: 'history',   label: 'History'       },
].filter(tab => FAVOURITES_ENABLED || tab.id !== 'favorites');
