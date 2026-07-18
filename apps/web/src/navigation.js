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
