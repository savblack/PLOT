/**
 * Mobile storage for Home's "Your first week of Premium" card. The keys, the
 * encoding and the rules live in @plot/core/premiumFirstWeek.js so they can't
 * drift from web; this file is only the AsyncStorage side (web's is
 * apps/web/src/utils/premiumFirstWeekState.js).
 *
 * Web starts the week when the browser comes back from Stripe with
 * ?checkout=success. The phone has no such moment: checkout is in the
 * browser, and the upgrade may have been made on web. The profile has no
 * "Premium since" date and web's start is kept in that browser, so there is
 * nothing shared to read. Instead the phone notes when it sees the account on
 * Free, and starts the week the first time it then sees it on Premium
 * (premiumFirstWeekShouldStart, which also covers an account younger than a
 * week). A long-standing member on a new phone gets no card.
 */
import {
  PREMIUM_SEEN_FREE, hidePremiumFirstWeek, parsePremiumFirstWeek, premiumFirstWeekKey, premiumFirstWeekShouldStart,
  premiumSeenFreeKey, serialisePremiumFirstWeek, startPremiumFirstWeek,
  type PremiumFirstWeekState,
} from '@plot/core/premiumFirstWeek.js';
import { readStorage, writeStorage } from './storage';

export async function readPremiumFirstWeek(userId: string | null | undefined): Promise<PremiumFirstWeekState | null> {
  return userId ? parsePremiumFirstWeek(await readStorage(premiumFirstWeekKey(userId))) : null;
}

/**
 * The profile has loaded: note the plan it is on.
 *
 * `started` is true only when this call started the week and it reads back,
 * so the caller counts a start once and only when the card will really show
 * (the same contract as web's beginPremiumFirstWeek).
 */
export async function notePremiumPlan(
  userId: string,
  { isPremium, accountCreatedAt }: { isPremium: boolean; accountCreatedAt?: string | null },
): Promise<{ state: PremiumFirstWeekState | null; started: boolean }> {
  const existing = await readPremiumFirstWeek(userId);
  if (!isPremium) {
    if (!(await readStorage(premiumSeenFreeKey(userId)))) await writeStorage(premiumSeenFreeKey(userId), PREMIUM_SEEN_FREE);
    return { state: existing, started: false };
  }
  const seenFree = !!(await readStorage(premiumSeenFreeKey(userId)));
  if (!premiumFirstWeekShouldStart({ existing, isPremium, seenFree, accountCreatedAt })) return { state: existing, started: false };
  await writeStorage(premiumFirstWeekKey(userId), serialisePremiumFirstWeek(startPremiumFirstWeek(null)));
  const state = await readPremiumFirstWeek(userId);
  return { state, started: !!state };
}

async function update(userId: string, change: (state: PremiumFirstWeekState) => PremiumFirstWeekState) {
  const state = await readPremiumFirstWeek(userId);
  if (!state) return null;
  const next = change(state);
  await writeStorage(premiumFirstWeekKey(userId), serialisePremiumFirstWeek(next));
  return next;
}

export const hidePremiumFirstWeekFor = (userId: string) => update(userId, state => hidePremiumFirstWeek(state));
export const closePremiumFirstWeek = (userId: string) => update(userId, state => ({ ...state, closed: true }));
