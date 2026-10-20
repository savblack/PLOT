/**
 * Mobile storage for the first-win card on Home. The key, encoding and rules
 * live in @plot/core/firstWinCard.js. This file is only the AsyncStorage side.
 */
import {
  armFirstWin, dismissFirstWinCard, firstWinKey, parseFirstWinCard,
  serialiseFirstWinCard, suppressFirstWinImport,
  type FirstWinCardState,
} from '@plot/core/firstWinCard.js';
import { readStorage, writeStorage } from './storage';

export async function readFirstWinCard(userId: string | null | undefined): Promise<FirstWinCardState | null> {
  return userId ? parseFirstWinCard(await readStorage(firstWinKey(userId))) : null;
}

async function update(userId: string, change: (state: FirstWinCardState) => FirstWinCardState | null) {
  const state = await readFirstWinCard(userId);
  if (!state) return null;
  const next = change(state);
  if (!next) return null;
  await writeStorage(firstWinKey(userId), serialiseFirstWinCard(next));
  return next;
}

/** Onboarding finished. Once per account on this device. */
export async function armFirstWinCard(userId: string, { skipped = false } = {}): Promise<void> {
  const key = firstWinKey(userId);
  if (await readStorage(key)) return;
  await writeStorage(key, serialiseFirstWinCard(armFirstWin({ skipped })));
}

export const dismissFirstWinFor = (userId: string) => update(userId, dismissFirstWinCard);

export const suppressFirstWinForImport = (userId: string, source?: string | null) => update(userId, state => suppressFirstWinImport(state, source));
