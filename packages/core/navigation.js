export const APP_NAV_ITEMS = [
  { id: 'home', label: 'Home', path: '/home', primary: true },
  { id: 'calendar', label: 'Calendar', path: '/calendar', primary: true },
  { id: 'my-lists', label: 'My Lists', path: '/my-lists', primary: true },
  { id: 'search', label: 'Search', path: '/search', primary: false },
  { id: 'settings', label: 'Settings', path: '/settings', primary: false },
];

export const PRIMARY_NAV_ITEMS = APP_NAV_ITEMS.filter(item => item.primary);

export const VIEW_TITLES = APP_NAV_ITEMS.reduce(
  (titles, item) => ({ ...titles, [item.id]: item.id === 'home' ? 'PLOT' : item.label }),
  {
    guide: 'Guide',
    'design-system': 'Design System',
    requests: 'Follow requests',
    notifications: 'Notifications',
  },
);

export function pathForView(view) {
  return APP_NAV_ITEMS.find(item => item.id === view)?.path ?? `/${view}`;
}

export function viewFromPath(pathname) {
  const path = pathname.replace(/\/+$/, '') || '/home';
  const fallbackView = path.replace(/^\//, '') || 'home';
  const navItem = APP_NAV_ITEMS.find(item => item.path === path);
  return navItem?.id ?? fallbackView;
}

/* Sub-tabs nested under Home. Web renders these in DiscoverView's toolbar;
   mobile renders the same ids in its Discover header. A `feed` tab used to lead
   this list, gated by SHOW_SOCIAL_FEED; the social feed was dropped in favour of
   profiles, so it and its flag are gone. The feed_posts activity substrate is
   still recording, unsurfaced, if an activity stream is ever wanted. */
export const DISCOVER_TABS = [
  { id: 'discover', label: 'Discover' },
  { id: 'new',      label: 'New Releases' },
  { id: 'releases', label: 'Upcoming' },
  { id: 'guide',    label: 'Guide' },
];

/* Tabs nested under My Lists. Ids match the collapsible section ids so the
   expand/collapse-all control can scope itself to the active tab. */
export const MY_LISTS_TABS = [
  { id: 'all',       label: 'All'           },
  { id: 'watching',  label: 'Watching'      },
  { id: 'want',      label: 'Want to Watch' },
  { id: 'top10',     label: 'Top 10'        },
  { id: 'favorites', label: null            }, // region-spelled at the call site
  { id: 'lists',     label: 'Lists'         },
  { id: 'history',   label: 'History'       },
];
