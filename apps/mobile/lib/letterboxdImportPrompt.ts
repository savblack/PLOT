/**
 * Mobile storage for the "finish your Letterboxd import" reminder. The key
 * and rules live in @plot/core/letterboxdImportPrompt.js.
 */
import {
  letterboxdImportPromptKey, nextLetterboxdImportPrompt, parseLetterboxdImportPrompt,
  serialiseLetterboxdImportPrompt,
  type LetterboxdImportPrompt,
} from '@plot/core/letterboxdImportPrompt.js';
import { readStorage, removeStorage, writeStorage } from './storage';

export async function readLetterboxdImportPrompt(userId: string | null | undefined): Promise<LetterboxdImportPrompt | null> {
  return userId ? parseLetterboxdImportPrompt(await readStorage(letterboxdImportPromptKey(userId))) : null;
}

export async function rememberLetterboxdImport(userId: string | null | undefined, now = Date.now()): Promise<LetterboxdImportPrompt | null> {
  if (!userId) return null;
  const next = nextLetterboxdImportPrompt(await readLetterboxdImportPrompt(userId), now);
  await writeStorage(letterboxdImportPromptKey(userId), serialiseLetterboxdImportPrompt(next));
  return next;
}

export async function clearLetterboxdImport(userId: string | null | undefined): Promise<void> {
  if (userId) await removeStorage(letterboxdImportPromptKey(userId));
}
