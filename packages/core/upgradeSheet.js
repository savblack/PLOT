/**
 * Content for the in-app Premium upgrade sheet, shared by web and mobile.
 * Each reason is a Free limit someone just hit; the sheet leads with the
 * Premium feature that lifts it, then a few other Premium rows.
 */
import { PLANS_PAGE } from './copy/plansPage.js';
import { SETTINGS_VIEW } from './copy/settingsView.js';
import { FREE_CUSTOM_LIST_CAP } from './premium.js';
import { isPremiumFamily } from './themes.js';

/** @typedef {'lists' | 'themes' | 'smartLists' | 'collaborativeLists' | 'alerts'} UpgradeReason */

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
