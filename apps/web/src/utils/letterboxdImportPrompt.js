// Web storage for the "finish your Letterboxd import" reminder. The key and
// rules live in @plot/core/letterboxdImportPrompt.js.
import {
  letterboxdImportPromptKey, nextLetterboxdImportPrompt, parseLetterboxdImportPrompt,
  serialiseLetterboxdImportPrompt,
} from '@plot/core/letterboxdImportPrompt.js';
import { readStorage, removeStorage, writeStorage } from './storage.js';

export function readLetterboxdImportPrompt(userId) {
  return userId ? parseLetterboxdImportPrompt(readStorage(letterboxdImportPromptKey(userId))) : null;
}

export function rememberLetterboxdImport(userId, now = Date.now()) {
  if (!userId) return null;
  const next = nextLetterboxdImportPrompt(readLetterboxdImportPrompt(userId), now);
  writeStorage(letterboxdImportPromptKey(userId), serialiseLetterboxdImportPrompt(next));
  return next;
}

export function clearLetterboxdImport(userId) {
  if (userId) removeStorage(letterboxdImportPromptKey(userId));
}
