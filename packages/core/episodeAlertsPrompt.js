// The one-time "turn on episode alerts?" prompt after a person's first
// forward episode tick. The watching hook notes a candidate; one controller
// per app decides whether to show it; the toast views only draw it.
import { useCallback, useEffect, useState, useSyncExternalStore } from 'react';
import { emit, on } from './events.js';
import { enableEpisodeAlerts } from './useEpisodeAlerts.js';

export const EPISODE_ALERTS_PROMPT_EVENT = 'plot:episode-alerts-prompt';

/** @param {string | null | undefined} userId */
export function episodeAlertsPromptStorageKey(userId) {
  return `plot.episodeAlertsPrompt.${userId}`;
}

/**
 * True when any watching row is already past the season 1 episode 1 pointer
 * that startWatching writes. That pointer is not an episode tick.
 *
 * @param {Array<{ current_season?: number | string, current_episode?: number | string }> | null | undefined} rows
 * @returns {boolean}
 */
export function hasPriorEpisodeProgress(rows) {
  return (rows || []).some(row => {
    const season = Number(row?.current_season) || 0;
    const episode = Number(row?.current_episode) || 0;
    return season > 1 || (season === 1 && episode > 1);
  });
}

/**
 * The prompt for a forward episode tick, or null when this tick is not their
 * first. `rows` is the watching list from before the write.
 *
 * @param {{
 *   rows: Array<{ current_season?: number | string, current_episode?: number | string }> | null | undefined,
 *   userId: string | null | undefined,
 *   tmdbId: number | string | null | undefined,
 *   title?: string | null,
 *   forward: boolean,
 * }} args
 * @returns {{ userId: string, tmdbId: number, title: string } | null}
 */
export function episodeAlertsPromptForTick({ rows, userId, tmdbId, title, forward }) {
  const id = Number(tmdbId);
  if (!forward || !userId || !Number.isInteger(id) || id < 1) return null;
  if (hasPriorEpisodeProgress(rows)) return null;
  return { userId: String(userId), tmdbId: id, title: typeof title === 'string' ? title : '' };
}

/** @type {{ userId: string, tmdbId: number, title: string } | null} */
let candidate = null;
/** @type {{ userId: string, tmdbId: number, title: string } | null} */
let offer = null;
/** @type {Set<() => void>} */
const subscribers = new Set();
let deciding = false;

function publish(next) {
  offer = next;
  subscribers.forEach(fn => fn());
}

function subscribe(onStoreChange) {
  subscribers.add(onStoreChange);
  return () => { subscribers.delete(onStoreChange); };
}

function getOffer() {
  return offer;
}

/**
 * Remember a candidate and tell a mounted controller. A tick that lands
 * before the controller mounts is still there for it to read.
 *
 * @param {{ userId: string, tmdbId: number, title?: string }} detail
 */
export function noteEpisodeAlertsCandidate(detail) {
  if (!detail?.userId || !detail.tmdbId) return;
  candidate = {
    userId: String(detail.userId),
    tmdbId: Number(detail.tmdbId),
    title: typeof detail.title === 'string' ? detail.title : '',
  };
  // A controller that is already mounted hears this. One that mounts later
  // reads `candidate` itself.
  emit(EPISODE_ALERTS_PROMPT_EVENT, candidate);
}

/** @returns {typeof offer} */
export function useEpisodeAlertsOffer() {
  return useSyncExternalStore(subscribe, getOffer, getOffer);
}

export function dismissEpisodeAlertsPrompt() {
  publish(null);
}

/**
 * Accept turns alerts on for the offered show and clears the toast. A failed
 * write leaves the toast up. Tracking stays with the app, which already owns
 * episode_alerts_toggled for the title-panel switch.
 *
 * @param {string | null | undefined} userId
 */
export function useEpisodeAlertsPromptActions(userId) {
  const current = useEpisodeAlertsOffer();
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);

  const accept = useCallback(async () => {
    if (!current || busy) return { ok: false, tmdbId: current?.tmdbId ?? null };
    setBusy(true);
    setFailed(false);
    const result = await enableEpisodeAlerts(userId, current.tmdbId);
    setBusy(false);
    if (!result.ok) {
      setFailed(true);
      return { ok: false, tmdbId: current.tmdbId };
    }
    dismissEpisodeAlertsPrompt();
    return { ok: true, tmdbId: current.tmdbId };
  }, [current, busy, userId]);

  const dismiss = useCallback(() => {
    setFailed(false);
    dismissEpisodeAlertsPrompt();
  }, []);

  return { offer: current, busy, failed, accept, dismiss };
}

/**
 * Show the staged candidate at most once per account on this device.
 * `storage` must be stable across renders. The seen flag is written when the
 * toast is shown, so dismissing it does not bring it back.
 *
 * @param {string | null | undefined} userId
 * @param {{
 *   readSeen: (userId: string) => Promise<boolean>,
 *   writeSeen: (userId: string) => Promise<void>,
 * }} storage
 */
export function useEpisodeAlertsPromptController(userId, storage) {
  useEffect(() => {
    if (!userId || !storage) {
      publish(null);
      return undefined;
    }
    let alive = true;
    const consider = async (detail) => {
      if (!alive || deciding || offer) return;
      if (!detail || String(detail.userId) !== String(userId)) return;
      deciding = true;
      try {
        const seen = await storage.readSeen(String(userId));
        if (!alive || seen) return;
        await storage.writeSeen(String(userId));
        if (!alive) return;
        publish(detail);
      } finally {
        deciding = false;
      }
    };
    consider(candidate);
    const unsubscribe = on(EPISODE_ALERTS_PROMPT_EVENT, consider);
    return () => { alive = false; unsubscribe(); };
  }, [userId, storage]);
}
