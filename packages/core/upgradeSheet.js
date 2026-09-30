/**
 * Content for the in-app Premium upgrade sheet, shared by web and mobile.
 * Each reason is a Free limit someone just hit; the sheet leads with the
 * Premium feature that lifts it, then a few other Premium rows.
 */
import { PLANS_PAGE } from './copy/plansPage.js';
import { FREE_CUSTOM_LIST_CAP } from './premium.js';

/** @typedef {'lists'} UpgradeReason */

/**
 * @typedef {object} UpgradeSheetContent
 * @property {string} context  what just happened, e.g. "You've used all 5 free lists"
 * @property {number} meter    how many filled segments the limit meter shows
 * @property {string} title
 * @property {string} body
 * @property {Array<{icon: string, label: string, note?: string}>} also
 */

/**
 * @param {UpgradeReason} reason
 * @returns {UpgradeSheetContent | null} null for an unknown reason
 */
export function upgradeSheetContent(reason) {
  const copy = PLANS_PAGE.upgradeSheet.reasons[reason];
  if (!copy) return null;
  const cap = reason === 'lists' ? FREE_CUSTOM_LIST_CAP : 0;
  return {
    context: copy.context(cap),
    meter: cap,
    title: copy.title,
    body: copy.body,
    also: copy.also
      .map(icon => PLANS_PAGE.premiumCard.find(row => row.icon === icon))
      .filter(Boolean),
  };
}
