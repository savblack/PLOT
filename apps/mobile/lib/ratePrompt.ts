/**
 * Mobile's side of the rating prompts (@plot/core/ratePrompt.js decides what
 * to ask about; this holds device state and the native pieces):
 *
 * - the "fresh, unrated mark" the title foot bar notes, which the rate toast
 *   picks up when the panel closes;
 * - the per-account set of titles the Home card was dismissed for;
 * - the next-morning local notification. Local, not push: it needs no server,
 *   no Premium and no token, only a permission the user already granted for
 *   title alerts. Nothing here ever shows the OS permission prompt.
 */
import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';
import { ratePromptKey } from '@plot/core/ratePrompt.js';
import { RATE_PROMPT } from '@plot/core/copy/ratePrompt.js';
import { readStorage, writeStorage } from './storage';

export type RateTarget = { tmdbId: number; mediaType: 'movie' | 'tv'; title: string };

// ── The pending toast ──────────────────────────────────────────────────
let pending: RateTarget | null = null;
const listeners = new Set<() => void>();
const publish = () => listeners.forEach(fn => fn());

/** The foot bar marked this title watched with no rating. */
export function noteWatchedUnrated(target: RateTarget) {
  pending = target;
  publish();
}

/** A rating landed, or the mark was undone: nothing to ask. */
export function clearPendingRate(tmdbId?: number) {
  if (!pending || (tmdbId != null && pending.tmdbId !== tmdbId)) return;
  pending = null;
  publish();
}

export const getPendingRate = () => pending;
export function subscribePendingRate(fn: () => void) {
  listeners.add(fn);
  return () => { listeners.delete(fn); };
}

// ── Home card dismissals ───────────────────────────────────────────────
const dismissedKey = (userId: string) => `plot_rate_prompt_dismissed:${userId}`;

export async function readDismissedRatePrompts(userId: string): Promise<Set<string>> {
  try {
    const raw = await readStorage(dismissedKey(userId));
    const list = raw ? JSON.parse(raw) : [];
    return new Set(Array.isArray(list) ? list.filter((k): k is string => typeof k === 'string') : []);
  } catch {
    return new Set();
  }
}

export async function dismissRatePrompt(userId: string, entry: { tmdb_id: number; media_type: string }) {
  const set = await readDismissedRatePrompts(userId);
  set.add(ratePromptKey(entry));
  // Keep it small: the card only ever asks about the last three days.
  await writeStorage(dismissedKey(userId), JSON.stringify([...set].slice(-50)));
  return set;
}

// ── The next-morning notification ──────────────────────────────────────
export const RATE_NOTIFICATION_KIND = 'rate';
const REMINDER_HOUR = 9;
const lastScheduledKey = (userId: string) => `plot_rate_reminder_day:${userId}`;

const reminderId = (t: { tmdbId: number; mediaType: string }) => `rate-${t.mediaType}-${t.tmdbId}`;

async function canNotify() {
  if (Platform.OS !== 'ios' && Platform.OS !== 'android') return false;
  const p = await Notifications.getPermissionsAsync();
  return p.granted || p.ios?.status === Notifications.IosAuthorizationStatus.PROVISIONAL;
}

/**
 * Schedule "How was X?" for 9am tomorrow. One per account per day, and only
 * when notifications are already allowed. Returns whether one was scheduled.
 */
export async function scheduleRateReminder(userId: string, target: RateTarget, now = new Date()): Promise<boolean> {
  if (!(await canNotify())) return false;
  const today = now.toISOString().slice(0, 10);
  if ((await readStorage(lastScheduledKey(userId))) === today) return false;
  const at = new Date(now);
  at.setDate(at.getDate() + 1);
  at.setHours(REMINDER_HOUR, 0, 0, 0);
  await Notifications.scheduleNotificationAsync({
    identifier: reminderId(target),
    content: {
      title: RATE_PROMPT.question(target.title),
      body: RATE_PROMPT.notificationBody,
      data: { kind: RATE_NOTIFICATION_KIND, tmdbId: target.tmdbId, mediaType: target.mediaType, userId },
    },
    trigger: { type: Notifications.SchedulableTriggerInputTypes.DATE, date: at },
  });
  await writeStorage(lastScheduledKey(userId), today);
  return true;
}

/** The title was rated (or the mark undone): no reminder. Safe when none exists. */
export async function cancelRateReminder(target: { tmdbId: number; mediaType: string }) {
  try {
    await Notifications.cancelScheduledNotificationAsync(reminderId(target));
  } catch {
    // Nothing scheduled, or notifications unavailable on this platform.
  }
}
