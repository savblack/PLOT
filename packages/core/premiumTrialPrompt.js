/**
 * The one-time "Try Premium free for 7 days" prompt (board card #1, approved
 * by Savannah on 12 Nov 2026).
 *
 * Nobody met the paywall in the 14 days to 12 Nov (0 premium_gate_hit from
 * real people), so the offer goes to signed-in Free members at their most
 * engaged moment instead: right after onboarding completes, or right after a
 * Trakt import saves titles. It shows once per account on each device, opens
 * the existing upgrade sheet (and through it the existing Checkout with the
 * 7-day trial) once the shared value rule is met, and is easy to dismiss.
 * A suppressed offer is persisted on the caller's profile and claimed once
 * across devices before it opens.
 *
 * This module owns the rules, the storage key and a tiny in-memory request
 * channel. The moment happens in one place (OnboardingFlow, reportImport) and
 * the prompt renders in another (the app shell on web, Home on the phone), so
 * the moment calls requestPremiumTrialPrompt() and the shell listens. Like
 * finishingTouches.js, each app reads and writes the key itself: web through
 * localStorage, mobile through AsyncStorage.
 */
import { hasFeltValue } from './hasFeltValue.js';

/** @typedef {'onboarding' | 'trakt_import' | 'fifth_title' | 'second_session'} PremiumTrialPromptTrigger */

/** @type {readonly PremiumTrialPromptTrigger[]} */
export const PREMIUM_TRIAL_PROMPT_TRIGGERS = Object.freeze(['onboarding', 'trakt_import', 'fifth_title', 'second_session']);

/** The value stored once the prompt has been shown. */
export const PREMIUM_TRIAL_PROMPT_SEEN = 'shown';

/** The upgrade sheet reason for each trigger (copy in PLANS_PAGE.upgradeSheet.reasons). */
const SHEET_REASONS = Object.freeze({
  onboarding: 'trialAfterOnboarding',
  trakt_import: 'trialAfterTraktImport',
  fifth_title: 'trialAfterValue',
  second_session: 'trialAfterValue',
});

/** @param {string} userId */
export function premiumTrialPromptKey(userId) {
  return `plot.premiumTrialPrompt.${userId}`;
}

/**
 * @param {PremiumTrialPromptTrigger} trigger
 * @returns {import('./upgradeSheet.js').UpgradeReason | null}
 */
export function premiumTrialPromptReason(trigger) {
  return SHEET_REASONS[trigger] ?? null;
}

/**
 * The trigger for a finished import, or null. Only a Trakt import that saved
 * at least one title counts: an import that found only duplicates is not the
 * "my history is in" moment.
 *
 * @param {{ source?: string, count?: number }} props
 * @returns {PremiumTrialPromptTrigger | null}
 */
export function premiumTrialPromptTriggerForImport({ source, count } = {}) {
  return source === 'trakt' && Number(count) > 0 ? 'trakt_import' : null;
}

/**
 * Whether to show the prompt now. All of: not seen on this device, a Free
 * account, the server says this person can still have the trial (no earlier
 * subscription), and checkout is not closed. `trialEligible` must be the
 * answered value: undefined/null (billing still loading) is not yet.
 *
 * @param {{ seen: boolean, isPremium: boolean, trialEligible: boolean | null | undefined, checkoutOpen: boolean, titleCount: number | null, sessionCount: number | null }} state
 */
export function shouldShowPremiumTrialPrompt({ seen, isPremium, trialEligible, checkoutOpen, titleCount, sessionCount }) {
  return !seen && !isPremium && trialEligible === true && checkoutOpen
    && hasFeltValue({ titleCount, sessionCount });
}

/**
 * A suppressed request remains pending and must never write the seen flag.
 * @param {Parameters<typeof shouldShowPremiumTrialPrompt>[0] & { importRefreshReady?: boolean, trigger?: PremiumTrialPromptTrigger }} state
 * @returns {'discard' | 'show' | 'wait' | 'suppress'}
 */
export function premiumTrialPromptDecision(state) {
  if (state.seen || state.isPremium || state.trialEligible !== true || !state.checkoutOpen) return 'discard';
  if (state.trigger === 'trakt_import' && (!state.importRefreshReady || state.titleCount == null)) return 'wait';
  if (shouldShowPremiumTrialPrompt(state)) return 'show';
  if (state.titleCount == null || state.sessionCount == null) return 'wait';
  return 'suppress';
}

/**
 * Keep the import wording if it qualified immediately; name a later value moment.
 * @param {PremiumTrialPromptTrigger} trigger
 * @param {boolean} wasSuppressed
 * @param {number | null} titleCount
 * @returns {PremiumTrialPromptTrigger}
 */
export function premiumTrialPromptMoment(trigger, wasSuppressed, titleCount) {
  if (!wasSuppressed) return trigger;
  return titleCount >= 5 ? 'fifth_title' : 'second_session';
}

/** @type {PremiumTrialPromptTrigger | null} */
let pending = null;
let pendingVersion = 0;
/** @type {Set<(trigger: PremiumTrialPromptTrigger) => void>} */
const listeners = new Set();

/**
 * The moment happened. Only one trigger waits at a time and the latest wins:
 * someone who finishes onboarding straight into a Trakt import is offered the
 * trial once, worded for the import (the prompt holds an onboarding trigger
 * while the import page is open, see shouldHoldPremiumTrialPrompt).
 *
 * @param {PremiumTrialPromptTrigger} trigger
 */
export function requestPremiumTrialPrompt(trigger) {
  if (!PREMIUM_TRIAL_PROMPT_TRIGGERS.includes(trigger)) return;
  pending = trigger;
  pendingVersion += 1;
  notify();
}

/** Changes with each request, including a second request for the same trigger. */
export function premiumTrialPromptRequestVersion() {
  return pendingVersion;
}

/**
 * Hold the onboarding prompt while the person is on the import page (they
 * picked a source in onboarding and went straight there). It shows when they
 * leave, unless a Trakt import replaces it first.
 *
 * @param {PremiumTrialPromptTrigger | null} trigger
 * @param {string | null | undefined} view  the current app view, e.g. 'import'
 */
export function shouldHoldPremiumTrialPrompt(trigger, view) {
  return trigger === 'onboarding' && view === 'import';
}

/** The waiting trigger, without taking it. */
export function peekPremiumTrialPrompt() {
  return pending;
}

/** Take the waiting trigger (the prompt is about to decide on it). */
export function takePremiumTrialPrompt() {
  const trigger = pending;
  pending = null;
  return trigger;
}

/** Drop a waiting trigger, e.g. the person is already on their way to Checkout. */
export function clearPremiumTrialPrompt() {
  pending = null;
  notify();
}

let holds = 0;

function notify() {
  for (const fn of listeners) {
    try { fn(pending); } catch { /* a listener must never break the caller */ }
  }
}

/**
 * Hold the prompt while something else owns the screen. The phone's import
 * sheet takes a hold while it is open: a second native modal over it would
 * not appear on iOS, and a prompt behind it would count as shown when nobody
 * saw it. Returns the release; calling it twice is harmless.
 *
 * @returns {() => void}
 */
export function holdPremiumTrialPrompt() {
  holds += 1;
  let released = false;
  return () => {
    if (released) return;
    released = true;
    holds = Math.max(0, holds - 1);
    notify();
  };
}

/** True while anything holds the prompt. */
export function premiumTrialPromptHeld() {
  return holds > 0;
}

/**
 * Called with the waiting trigger whenever it or a hold changes.
 *
 * @param {(trigger: PremiumTrialPromptTrigger | null) => void} fn
 * @returns {() => void}
 */
export function onPremiumTrialPromptRequest(fn) {
  listeners.add(fn);
  if (pending) fn(pending);
  return () => { listeners.delete(fn); };
}
