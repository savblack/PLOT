// Web storage for the first-win card on Home. The key and encoding live in
// @plot/core/firstWinCard.js so mobile can read the same shape from
// AsyncStorage.
import {
  armFirstWin, dismissFirstWinCard, firstWinKey, parseFirstWinCard,
  serialiseFirstWinCard, suppressFirstWinImport,
} from '@plot/core/firstWinCard.js';
import { readStorage, writeStorage } from './storage.js';

export function readFirstWinCard(userId) {
  return userId ? parseFirstWinCard(readStorage(firstWinKey(userId))) : null;
}

function update(userId, change) {
  const state = readFirstWinCard(userId);
  if (!state) return null;
  const next = change(state);
  if (!next) return null;
  writeStorage(firstWinKey(userId), serialiseFirstWinCard(next));
  return next;
}

// Onboarding finished. Once per account on this device. A later visit does
// not arm the card again.
export function armFirstWinCard(userId, { skipped = false } = {}) {
  if (!userId) return null;
  const key = firstWinKey(userId);
  if (readStorage(key)) return readFirstWinCard(userId);
  const next = armFirstWin({ skipped });
  writeStorage(key, serialiseFirstWinCard(next));
  return next;
}

export const dismissFirstWinFor = (userId) => update(userId, dismissFirstWinCard);

export const suppressFirstWinForImport = (userId, source) => update(userId, state => suppressFirstWinImport(state, source));
