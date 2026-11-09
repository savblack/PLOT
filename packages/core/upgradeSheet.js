/**
 * Content for the in-app Premium upgrade sheet, shared by web and mobile.
 * Each reason is a Free limit someone just hit; the sheet leads with the
 * Premium feature that lifts it, then a few other Premium rows.
 */
import { PLANS_PAGE } from './copy/plansPage.js';
import { SETTINGS_VIEW } from './copy/settingsView.js';
import { FREE_CUSTOM_LIST_CAP } from './premium.js';
import { isPremiumFamily } from './themes.js';

/** @typedef {'lists' | 'themes' | 'pins' | 'smartLists' | 'collaborativeLists' | 'alerts' | 'alertEmail'} UpgradeReason */

/**
 * @typedef {object} UpgradeSheetContent
 * @property {string} context  what just happened, e.g. "You've used all 5 free lists"
 * @property {number} meter    how many filled segments the limit meter shows (0: no meter)
 * @property {string} title
 * @property {string} body
 * @property {Array<{icon: string, label: string, note?: string}>} also
 * @property {string | null} kept  for 'smartLists' after a Free viewer pressed
 *   Create: "Your rules are kept. Upgrade and the list is ready." (B5)
 * @property {{ family: string, line: string } | null} preview  for 'themes': the
 *   Premium family the viewer tapped, drawn light and dark with its line
 *   ("That’s Sage, in light and dark."). Only a picture: never applied.
 */

/**
 * @param {UpgradeReason} reason
 * @param {{ family?: string, kept?: boolean }} [options]  family: for 'themes', the Premium family tapped;
 *   kept: the viewer's smart list rules were kept for after upgrading
 * @returns {UpgradeSheetContent | null} null for an unknown reason
 */
export function upgradeSheetContent(reason, { family, kept = false } = {}) {
  const copy = PLANS_PAGE.upgradeSheet.reasons[reason];
  if (!copy) return null;
  const cap = reason === 'lists' ? FREE_CUSTOM_LIST_CAP : 0;
  return {
    context: copy.context(cap),
    meter: cap,
    title: copy.title,
    body: copy.body,
    kept: kept && copy.kept ? copy.kept : null,
    also: copy.also
      .map(icon => PLANS_PAGE.premiumCard.find(row => row.icon === icon))
      .filter(Boolean),
    preview: reason === 'themes' && isPremiumFamily(family)
      ? { family, line: SETTINGS_VIEW.appearance.previewing(SETTINGS_VIEW.appearance.families[family]) }
      : null,
  };
}

const UNTRACKED_GATE_FEATURES = {
  themes: 'themes',
  pins: 'pins',
  alerts: 'people_alerts',
  alertEmail: 'alert_email',
};

/**
 * The `premium_gate_hit` feature slug for sheet reasons whose callers do not
 * already emit `premium_gate_hit` (`lists`, `smartLists`, and
 * `collaborativeLists` emit at their action site).
 *
 * @param {UpgradeReason} reason
 * @returns {string | null}
 */
export function upgradeSheetGateFeature(reason) {
  return UNTRACKED_GATE_FEATURES[reason] ?? null;
}

/** @type {Set<(feature: string) => void>} */
const gateHitListeners = new Set();

/**
 * Subscribe to `premium_gate_hit` events from UpgradeSheet (wired in
 * configureCore.ts so mobile UpgradeSheet stays free of posthog-react-native
 * in Storybook).
 *
 * @param {(feature: string) => void} fn
 * @returns {() => void}
 */
export function onUpgradeSheetGateHit(fn) {
  gateHitListeners.add(fn);
  return () => { gateHitListeners.delete(fn); };
}

/**
 * Emit `premium_gate_hit` for sheet reasons whose callers do not already emit
 * at their action site (`lists`, `smartLists`, `collaborativeLists`).
 *
 * @param {UpgradeReason} reason
 */
export function reportUpgradeSheetGateHit(reason) {
  const feature = upgradeSheetGateFeature(reason);
  if (!feature) return;
  for (const fn of gateHitListeners) {
    try { fn(feature); } catch { /* analytics must never break the sheet */ }
  }
}
