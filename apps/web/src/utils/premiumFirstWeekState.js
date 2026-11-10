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

/** The person just came back from a successful checkout. */
export function beginPremiumFirstWeek(userId) {
  return userId ? write(userId, startPremiumFirstWeek(readPremiumFirstWeek(userId))) : null;
}

function update(userId, change) {
  const state = readPremiumFirstWeek(userId);
  return state ? write(userId, change(state)) : null;
}

export const hidePremiumFirstWeekFor = (userId) => update(userId, state => hidePremiumFirstWeek(state));
export const closePremiumFirstWeek = (userId) => update(userId, state => ({ ...state, closed: true }));
