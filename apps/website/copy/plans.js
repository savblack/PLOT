// Reference-only copy catalog for apps/website/plans.html. Not imported by
// the HTML — see copy/common.js for how this catalog is used.
//
// Note: the page's CSS also styles .tmony (testimonials) and .social-stats
// blocks, but neither has any actual markup/content in plans.html today —
// nothing to catalog there.

export const PLANS_PAGE = {
  meta: {
    title: 'Plans & Pricing — plot',
    description: 'plot is free to use, forever. Premium is coming soon, with unlimited lists, a live release calendar and Pick for Me: US$3/mo or US$24/yr, taxes included.',
    ogDescription: 'Free to use, forever. Premium is coming soon, with unlimited lists, a live release calendar and Pick for Me.',
  },

  hero: {
    pageLabel: 'Plans',
    h1: 'Do more with everything you watch',
    lede: 'Start free and keep every movie and show in one place. Premium is coming soon, with unlimited lists, a live release calendar in your calendar app and Pick for Me.',
  },

  billingToggle: {
    monthly: 'Monthly',
    annual: 'Annual',
    saveBadge: '4 months free', // hardcoded in HTML; $24/yr against $3/mo
  },

  freePlan: {
    name: 'Free',
    amount: '$0',
    per: 'forever',
    tagline: 'Everything you need to organise your watching.',
    features: [
      'Track movies & TV in one place',
      'Watchlist, history & release calendar',
      'Discover feed + Top 10 charts',
      'Up to 5 custom lists',
      'Follow friends & share your profile',
    ],
    cta: 'Get started free',
  },

  premiumPlan: {
    flag: 'Coming soon',
    name: 'Premium',
    // Amount/billed line are recalculated by JS when the billing toggle
    // changes; these are the initial (annual) values rendered in the HTML.
    amount: 'US$2',
    per: '/mo',
    billed: 'US$24 billed yearly · taxes included',
    billedMonthly: 'US$3 billed monthly · taxes included',
    tagline: 'Everything in Free, plus:',
    features: [
      'Unlimited custom lists',
      'Live release calendar in your calendar app',
      'Pick for Me: a shortlist for tonight',
    ],
    cta: 'Explore Premium',
  },

  comparison: {
    title: 'Compare plans',
    note: 'Premium features are coming soon.',
    columns: { feature: 'Feature', free: 'Free', premium: 'Premium' },
    rows: [
      { feature: 'Track movies & TV', free: true, premium: true },
      { feature: 'Watchlist & watch history', free: true, premium: true },
      { feature: 'Upcoming release calendar', free: true, premium: true },
      { feature: 'Discover feed + Top 10 charts', free: true, premium: true },
      { feature: 'Search every movie & show', free: true, premium: true },
      { feature: 'Follow friends & share profile', free: true, premium: true },
      { feature: 'Where to watch', free: true, premium: true },
      { feature: 'Custom lists', free: 'Up to 5', premium: 'Unlimited' },
      { feature: 'Live calendar subscription', free: false, premium: true },
      { feature: 'Pick for Me', free: false, premium: true },
    ],
  },

  faq: {
    title: 'Questions',
    items: [
      {
        q: 'Is the Free plan really free?',
        a: 'Yes. No credit card and no trial clock. Track as much as you like on Free, for as long as you like.',
      },
      {
        q: 'Can I get Premium now?',
        a: 'Not yet. Premium is coming soon at US$3/month or US$24/year, taxes included. Upgrading in the app shows a coming-soon message and doesn’t take a payment.',
      },
      {
        q: 'Can I cancel anytime?',
        a: 'Yes. Once Premium opens, cancel from Manage subscription in Settings and keep Premium until the end of the period you’ve paid for.',
      },
      {
        q: 'What happens to my lists if I downgrade?',
        a: 'Nothing is deleted. Your lists stay exactly as they are. You just can’t create new ones past the free limit until you upgrade again.',
      },
    ],
  },

  fineprint: 'Prices are in US dollars and include tax. Your total and billing currency are shown at checkout. Cancel anytime. Payments are processed securely by Stripe. Need a hand? contact@theplot.tv',
};
