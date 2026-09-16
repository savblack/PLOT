export const APP_NAV_ITEMS = [
  { id: 'home', label: 'Home', path: '/home', primary: true },
  { id: 'calendar', label: 'Calendar', path: '/calendar', primary: true },
  { id: 'my-lists', label: 'My Lists', path: '/my-lists', primary: true },
  // Web only for now: on web History is its own page (poster shelf plus an
  // insights panel); mobile still shows history as a My Lists tab, which is
  // why MY_LISTS_TABS below keeps its 'history' entry.
  { id: 'history', label: 'History', path: '/history', primary: true },
  // Web only in practice: mobile keeps Guide as a Home sub-tab (DISCOVER_TABS)
  // and its drawer hardcodes its own list. Not primary, so it stays out of the
  // web bottom tab bar; the sidebar and drawer render it.
  { id: 'guide', label: 'Guide', path: '/guide', primary: false },
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
    import: 'Import',
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
 * and rendered a second "PLOT" wordmark in the content column, directly beside
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

/* Sub-tabs nested under Home on MOBILE. Web no longer has them: Home is one
   scroll, Guide is a nav item, Upcoming is a Calendar view and New Releases
   has its own route. Mobile renders these ids in its Discover header and
   scripts/check-mobile-tabs.mjs reads this list, so it stays. A `feed` tab used to lead
   this list, gated by SHOW_SOCIAL_FEED; the social feed was dropped in favour of
   profiles, so it and its flag are gone. The feed_posts activity substrate is
   still recording, unsurfaced, if an activity stream is ever wanted. */
export const DISCOVER_TABS = [
  { id: 'discover', label: 'Discover' },
  { id: 'new',      label: 'New Releases' },
  { id: 'releases', label: 'Upcoming' },
  { id: 'guide',    label: 'Guide' },
];

/* Sub-tabs nested under My Lists on MOBILE. Web no longer has them: My Lists
   is one scroll of every list and History has its own route (/history). */
export const MY_LISTS_TABS = [
  { id: 'all',       label: 'All'           },
  { id: 'watching',  label: 'Watching'      },
  { id: 'want',      label: 'Want to Watch' },
  { id: 'top10',     label: 'Top 10'        },
  { id: 'favorites', label: null            }, // region-spelled at the call site
  { id: 'lists',     label: 'Lists'         },
  { id: 'history',   label: 'History'       },
];
