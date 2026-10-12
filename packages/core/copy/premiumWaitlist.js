// Premium waitlist on the Custom themes and Smart lists upgrade sheets.
// Checkout stays closed. "Not now" is PLANS_PAGE.upgradeSheet.notNow.
// Apostrophes are U+2019, matching the rest of the catalog.

export const PREMIUM_WAITLIST = Object.freeze({
  features: Object.freeze({
    themes: 'Custom themes',
    smart_lists: 'Smart lists',
  }),
  // The feature name is the label above, even when it is plural.
  headline: (feature) => `${feature} is part of Plot Premium`,
  body: 'Premium isn’t open yet. Leave your email and we’ll tell you the moment it is. Everything you use now stays free.',
  notify: 'Notify me',
  success: 'You’re on the list. We’ll email you once, when Premium opens.',
  emailLabel: 'Email',
  emailInvalid: 'Enter a valid email address.',
});
