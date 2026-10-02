/* The signed-in pages' chunk loaders, shared by the router (which lazy()s them)
   and by preloadAppViews (which warms them), so both resolve to the same
   module and a page the user reaches has usually been fetched already. */
export const loadDiscoverView = () => import('./components/DiscoverView.jsx');
export const loadTonightView = () => import('./components/TonightView.jsx');
export const loadGuideView = () => import('./components/GuideView.jsx');
export const loadCalendarView = () => import('./components/CalendarView.jsx');
export const loadMyListsView = () => import('./components/MyListsView.jsx');
export const loadHistoryView = () => import('./components/HistoryView.jsx');
export const loadListPage = () => import('./components/ListPage.jsx');
export const loadSearchView = () => import('./components/SearchView.jsx');
export const loadSettingsView = () => import('./components/SettingsView.jsx');

const PRELOAD = [
  loadDiscoverView, loadMyListsView, loadHistoryView, loadTonightView,
  loadListPage, loadGuideView, loadCalendarView, loadSearchView, loadSettingsView,
];

let started = false;

/**
 * Fetch the main pages' chunks once the browser is idle, one at a time so they
 * never compete with what the user is doing. A failed fetch is ignored: the
 * page's own lazy() import retries when it is actually opened.
 */
export function preloadAppViews() {
  if (started || typeof window === 'undefined') return;
  started = true;
  // Skip on data-saver or very slow connections.
  const conn = navigator.connection;
  if (conn?.saveData || /(^|-)2g$/.test(conn?.effectiveType || '')) return;
  const idle = window.requestIdleCallback || (cb => setTimeout(cb, 1500));
  let i = 0;
  const next = () => {
    if (i >= PRELOAD.length) return;
    const load = PRELOAD[i++];
    Promise.resolve().then(load).catch(() => {}).finally(() => idle(next));
  };
  idle(next);
}
