/* Where the app may send someone to buy Premium on the web.
 *
 * Plot has no in-app purchase and will not have one (PLO-526, decided):
 * Premium is bought on the web through Stripe. Apple's App Review Guidelines
 * (3.1.1(a), 3.1.3) allow an iOS app to carry a button or link to external
 * purchase without an entitlement only on the United States storefront. Other
 * storefronts allow it only with a StoreKit External Purchase Link Entitlement
 * and approved destinations, and everywhere else it is prohibited. This file is
 * the one place that rule lives, so it can be changed when Apple's rules change.
 *
 * Fail closed: an unknown storefront, an unlisted one, or any other platform
 * gets no purchase button. A person on such a storefront still has Premium
 * once they have bought it on the web, because the account is the same.
 *
 * Last checked against the App Review Guidelines on 2026-10-17. Read them again
 * before each App Store submission.
 */

/** iOS storefronts (ISO 3166-1 alpha-3, as StoreKit reports them) where a link out is allowed without an entitlement. */
export const IOS_LINKOUT_STOREFRONTS = Object.freeze(['USA']);

/**
 * @param {{ platform: string, storefront: string | null | undefined }} where
 *   platform: 'ios' | 'android' | 'web'. storefront: the App Store storefront country, or null when unknown.
 * @returns {boolean}
 */
export function canLinkOutToPurchase({ platform, storefront }) {
  if (platform !== 'ios' || !storefront) return false;
  return IOS_LINKOUT_STOREFRONTS.includes(String(storefront).trim().toUpperCase());
}
