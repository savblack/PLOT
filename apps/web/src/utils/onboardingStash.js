/**
 * Onboarding's in-memory picks, parked for a same-tab round trip. The Trakt
 * sign-in opens in a popup so the page stays alive; when a browser blocks the
 * popup the whole tab goes to Trakt instead, and the titles picked on step one
 * would be lost. They are stashed here before leaving and taken back when
 * ?import=trakt brings the flow home. sessionStorage: one tab, gone on close.
 */
const KEY = 'plot_onboarding_stash';
const TTL_MS = 30 * 60 * 1000;

const storage = () => {
  try { return typeof window !== 'undefined' ? window.sessionStorage : null; } catch { return null; }
};

/** @param {{ seeds?: any[] }} picks */
export function writeOnboardingStash(picks) {
  const store = storage();
  if (!store) return false;
  try { store.setItem(KEY, JSON.stringify({ ...picks, at: Date.now() })); return true; } catch { return false; }
}

/** Returns the stash once and clears it. Null when there is none or it is stale. */
export function takeOnboardingStash() {
  const store = storage();
  if (!store) return null;
  try {
    const raw = store.getItem(KEY);
    store.removeItem(KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed.at !== 'number' || Date.now() - parsed.at > TTL_MS) return null;
    return { seeds: Array.isArray(parsed.seeds) ? parsed.seeds : [] };
  } catch { return null; }
}
