/**
 * Mobile storage for Home's Finishing touches card. The key, encoding and rules
 * live in @plot/core/finishingTouches.js so they can't drift from web; this file
 * is only the AsyncStorage side (web's is apps/web/src/utils/finishingTouchesState.js).
 *
 * AsyncStorage is async, so reads resolve after first paint: callers treat
 * "not loaded yet" as "no card" and the card appears once the read lands.
 */
import {
  finishingTouchesKey, hideFinishingTouches, noteImportFinished, parseFinishingTouches,
  serialiseFinishingTouches, startFinishingTouches,
  type FinishingTouchesState,
} from '@plot/core/finishingTouches.js';
import { readStorage, writeStorage } from './storage';

export async function readFinishingTouches(userId: string | null | undefined): Promise<FinishingTouchesState | null> {
  return userId ? parseFinishingTouches(await readStorage(finishingTouchesKey(userId))) : null;
}

async function update(userId: string, change: (state: FinishingTouchesState) => FinishingTouchesState) {
  const state = await readFinishingTouches(userId);
  if (!state) return null;
  const next = change(state);
  await writeStorage(finishingTouchesKey(userId), serialiseFinishingTouches(next));
  return next;
}

/** Onboarding finished: start the card, once per account on this device. */
export async function startFinishingTouchesFor(userId: string): Promise<void> {
  const key = finishingTouchesKey(userId);
  if (!(await readStorage(key))) await writeStorage(key, serialiseFinishingTouches(startFinishingTouches(Date.now())));
}

/** An import finished: ticks "Bring your history over". A Trakt import that
 *  wrote at least one row also completes "Mark where you're up to". A no-op
 *  when the card was never started. */
export const markImportDone = (userId: string, source?: string | null, importedCount?: number | null) => update(userId, state => noteImportFinished(state, source, importedCount));
export const hideFinishingTouchesFor = (userId: string) => update(userId, state => hideFinishingTouches(state));
export const closeFinishingTouches = (userId: string) => update(userId, state => ({ ...state, closed: true }));
