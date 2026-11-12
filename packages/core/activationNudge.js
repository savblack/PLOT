// The empty-library nudge: "Add your first show or movie", plus a button per
// import source that is confirmed to work end to end. It shows while the
// account has no titles at all (watchlist, watching, watched) and goes away at
// the first one. Any number counts: there is no target. Rendering stays per
// app (web HomeTopCards and History; mobile Home and History).
import { useEffect, useState } from 'react';
import { availableImportSources } from './onboardingSetup.js';
import { on, HISTORY_CHANGED_EVENT } from './events.js';
import { supabase } from './supabase.js';

/**
 * Import sources the nudge may offer, in button order. Only sources confirmed
 * end to end in production belong here (the 12 Nov 2026 importer check on
 * Notion card "#3 Activation"): Trakt (connected account, 17 completed
 * production imports) and Simkl (a 1,042-title production import on 10 Nov).
 * Letterboxd, IMDb, Netflix and Prime Video pass fixtures and staging but have
 * no production success since the 11 Nov import-flag fix; Disney+, Max and
 * Apple TV+ have no real export file to test; Plex waits on deployment
 * approval; TV Time is off in production. Add a source here once it has
 * one confirmed production import.
 */
export const ACTIVATION_NUDGE_SOURCE_IDS = Object.freeze(['trakt', 'simkl']);

/**
 * The confirmed sources this app can offer now (flags and keys as the import
 * page reads them: Simkl needs its client id).
 * @param {{ tvTimeImportEnabled?: boolean, simklClientId?: string | null }} [config]
 * @returns {import('./onboardingSetup.js').ImportSource[]}
 */
export function activationNudgeSources(config = {}) {
  const available = availableImportSources(config);
  const out = [];
  for (const id of ACTIVATION_NUDGE_SOURCE_IDS) {
    const src = available.find(item => item.id === id);
    if (src && (src.id !== 'simkl' || !!config.simklClientId)) out.push(src);
  }
  return out;
}

/**
 * Shown only once every read has answered and the account has no titles, so
 * it never flashes at someone whose lists are still loading.
 * @param {{ ready: boolean, watchlistCount?: number, watchingCount?: number, historyCount?: number | null }} input
 */
export function shouldShowActivationNudge({ ready, watchlistCount = 0, watchingCount = 0, historyCount = null }) {
  if (!ready || historyCount == null) return false;
  return watchlistCount + watchingCount + historyCount === 0;
}

/**
 * Whether the account has any watched history: 0, 1 (one is enough to know),
 * or null while unknown or after a failed read (the nudge stays hidden).
 * Re-reads when history changes, so the nudge goes as soon as something is
 * marked watched or an import lands.
 * @param {string | null | undefined} userId
 * @param {{ client?: any }} [options]
 * @returns {number | null}
 */
export function useHistoryCount(userId, { client = supabase } = {}) {
  const [state, setState] = useState(/** @type {{ userId: string, count: number | null } | null} */ (null));
  useEffect(() => {
    if (!userId) return undefined;
    let active = true;
    const load = async () => {
      try {
        const { data, error } = await client.from('history').select('id').eq('user_id', userId).limit(1);
        if (active) setState({ userId, count: error ? null : (data?.length ?? 0) });
      } catch {
        if (active) setState({ userId, count: null });
      }
    };
    void load();
    const stop = on(HISTORY_CHANGED_EVENT, load);
    return () => { active = false; stop(); };
  }, [client, userId]);
  return state && state.userId === userId ? state.count : null;
}
