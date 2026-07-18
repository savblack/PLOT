export const APP_NAV_ITEMS = [
  // Primary tabs (bottom bar). Discover / Releases / Guide were sub-tabs inside
  // the old Home view; they're now peers of Feed, driven by the route.
  { id: 'feed', label: 'Feed', path: '/feed', primary: true },
  { id: 'home', label: 'Discover', path: '/home', primary: true },
  { id: 'releases', label: 'Releases', path: '/releases', primary: true },
  { id: 'guide', label: 'Guide', path: '/guide', primary: true },
  // Secondary sections — reachable from the drawer, not the bottom bar.
  { id: 'my-lists', label: 'My Lists', path: '/my-lists', primary: false },
  { id: 'calendar', label: 'Calendar', path: '/calendar', primary: false },
  { id: 'history', label: 'History', path: '/history', primary: false },
  // Utility — placed in the header (search) / drawer footer (settings).
  { id: 'search', label: 'Search', path: '/search', primary: false },
  { id: 'settings', label: 'Settings', path: '/settings', primary: false },
];

export const PRIMARY_NAV_ITEMS = APP_NAV_ITEMS.filter(item => item.primary);

// Drawer menu: every browseable section (search lives in the header, settings in
// the drawer footer, so both are excluded here).
export const DRAWER_NAV_ITEMS = APP_NAV_ITEMS.filter(
  item => item.id !== 'search' && item.id !== 'settings',
);

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
