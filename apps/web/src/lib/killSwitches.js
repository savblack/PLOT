// Web side of @plot/core/killSwitches.js. DOM-specific (localStorage, the
// router, document visibility), so it stays in the web app; mobile parity is
// tracked in savblack/PLOT#1631.
//
// launchFeatures.js reads the stored kill list once, at load. This refreshes
// it in the background: shortly after start-up, then whenever the tab comes
// back into view (at most every REFRESH_MS). A switch that newly turns off a
// feature this page is showing makes the next in-app navigation a full page
// load, so the feature leaves within one click instead of whenever the tab is
// next reopened. Lifting a switch just waits for the next load.
import {
  fetchKilledSwitches,
  KILL_SWITCH_STORAGE_KEY,
  newlyKilled,
} from '@plot/core/killSwitches.js';
import { KILLED_AT_LOAD, LAUNCH_DEFAULTS } from '../launchFeatures.js';

const REFRESH_MS = 5 * 60_000;

/**
 * @param {{ router: { subscribe: (fn: (state: any) => void) => () => void }, host: string, token: string }} opts
 */
export function startKillSwitches({ router, host, token }) {
  if (!host || !token || typeof window === 'undefined') return;
  let lastFetch = 0;
  let reloadOnNavigate = false;
  let lastPath = window.location.pathname + window.location.search;

  const refresh = async () => {
    const now = Date.now();
    if (now - lastFetch < REFRESH_MS) return;
    lastFetch = now;
    const fresh = await fetchKilledSwitches({ http: window.fetch.bind(window), host, token });
    if (!fresh) return; // unknown: keep what we had
    try { window.localStorage.setItem(KILL_SWITCH_STORAGE_KEY, JSON.stringify(fresh)); } catch { /* storage full or blocked */ }
    if (newlyKilled(KILLED_AT_LOAD, fresh, LAUNCH_DEFAULTS).length) reloadOnNavigate = true;
  };

  router.subscribe((state) => {
    const path = state.location.pathname + state.location.search;
    if (path === lastPath) return;
    lastPath = path;
    // The URL already points at the new page, so a reload lands there.
    if (reloadOnNavigate) window.location.reload();
  });

  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') refresh();
  });
  // After the first paint, so the read never competes with start-up.
  setTimeout(refresh, 3000);
}
