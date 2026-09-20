import { readStorage, writeStorage } from './storage.js';

// Web-only recognition for the signed-out save handoff. This deliberately
// stores only a boolean, never an email or user id: it can tell us that this
// browser has used a PLOT account, not which person is currently holding it.
const KNOWN_ACCOUNT_KEY = 'plot-known-account';

export function markKnownAccountBrowser() {
  return writeStorage(KNOWN_ACCOUNT_KEY, '1');
}

export function isKnownAccountBrowser() {
  return readStorage(KNOWN_ACCOUNT_KEY) === '1';
}
