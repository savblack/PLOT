// Web storage for Home's "Your first week of Premium" card. The key and the
// encoding live in @plot/core/premiumFirstWeek.js so mobile can read the same
// shape from AsyncStorage; this file is only the localStorage side.
import {
  hidePremiumFirstWeek, parsePremiumFirstWeek, premiumFirstWeekKey, serialisePremiumFirstWeek, startPremiumFirstWeek,
} from '@plot/core/premiumFirstWeek.js';
import { readStorage, writeStorage } from './storage.js';

export function readPremiumFirstWeek(userId) {
  return userId ? parsePremiumFirstWeek(readStorage(premiumFirstWeekKey(userId))) : null;
}

function write(userId, state) {
  writeStorage(premiumFirstWeekKey(userId), serialisePremiumFirstWeek(state));
  return state;
}

/**
 * The person just came back from a successful checkout.
 *
 * @returns {boolean} true only when this call started the week: none was
 *   stored before, and the new one reads back. False when a week was already
 *   running (a plan change) or the browser would not store it (private
 *   mode), so the caller counts a start once and only when the card will
 *   really show.
 */
export function beginPremiumFirstWeek(userId) {
  if (!userId) return false;
  const existing = readPremiumFirstWeek(userId);
  write(userId, startPremiumFirstWeek(existing));
  return !existing && !!readPremiumFirstWeek(userId);
}

function update(userId, change) {
  const state = readPremiumFirstWeek(userId);
  return state ? write(userId, change(state)) : null;
}

export const hidePremiumFirstWeekFor = (userId) => update(userId, state => hidePremiumFirstWeek(state));
export const closePremiumFirstWeek = (userId) => update(userId, state => ({ ...state, closed: true }));
