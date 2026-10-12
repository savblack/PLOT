// Web storage for Home's Finishing touches card. The key and encoding live in
// @plot/core/finishingTouches.js so mobile can read the same shape from
// AsyncStorage; this file is only the localStorage side.
import {
  finishingTouchesKey, hideFinishingTouches, noteImportFinished, parseFinishingTouches, serialiseFinishingTouches,
} from '@plot/core/finishingTouches.js';
import { readStorage, writeStorage } from './storage.js';

export function readFinishingTouches(userId) {
  return userId ? parseFinishingTouches(readStorage(finishingTouchesKey(userId))) : null;
}

function update(userId, change) {
  const state = readFinishingTouches(userId);
  if (!state) return null;
  const next = change(state);
  writeStorage(finishingTouchesKey(userId), serialiseFinishingTouches(next));
  return next;
}

// An import finished: ticks "Bring your history over". A Trakt import also
// completes "Mark where you're up to". A no-op for accounts that never had the card.
export const markImportDone = (userId, source) => update(userId, state => noteImportFinished(state, source));
export const hideFinishingTouchesFor = (userId) => update(userId, state => hideFinishingTouches(state));
export const closeFinishingTouches = (userId) => update(userId, state => ({ ...state, closed: true }));
