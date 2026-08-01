// Reference-only copy catalog for apps/website/plans.html. Not imported by
// the HTML — see copy/common.js for how this catalog is used.
//
// Note: the page's CSS also styles .tmony (testimonials) and .social-stats
// blocks, but neither has any actual markup/content in plans.html today —
// nothing to catalog there.

export const PLANS_PAGE = {
  meta: {
    title: 'Plans & Pricing — PLOT',
    description: 'PLOT is free to use, forever. Go Premium for unlimited lists and automatic sync from Plex, Trakt, Netflix, Prime, Disney+ and more — A$3/mo or A$25/yr.',
    ogDescription: 'Free to use, forever. Go Premium for unlimited lists and automatic sync across every service you watch.',
  },

  hero: {
    pageLabel: 'Plans',
    h1: 'Do more with everything you watch',
    lede: 'Start free and keep every movie and show in one place. Go Premium for unlimited lists and automatic sync from every service you use.',
  },

  billingToggle: {
    monthly: 'Monthly',
    annual: 'Annual',
    saveBadge: 'Save 31%', // hardcoded in HTML; JS recomputes the live % from MONTHLY/ANNUAL
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
      'Up to 3 custom lists',
      'Follow friends & share your profile',
    ],
    cta: 'Get started free',
  },

  premiumPlan: {
    flag: 'Recommended',
    name: 'Premium',
    // Amount/billed line are recalculated by JS when the billing toggle
    // changes; these are the initial (annual) values rendered in the HTML.
    amount: 'A$2.08',
    per: '/mo',
    billed: 'Billed A$25 yearly · save 31%',
    billedMonthly: 'Billed monthly',
    tagline: 'Everything in Free, plus:',
    features: [
      'Unlimited custom lists',
      'Auto-sync your watchlist & history from Plex',
      'Sync Netflix, Prime, Disney+ & more via Trakt',
      'Everything stays up to date, automatically',
    ],
    cta: 'Go Premium',
  },

  comparison: {
    title: 'Compare plans',
    columns: { feature: 'Feature', free: 'Free', premium: 'Premium' },
    rows: [
      { feature: 'Track movies & TV', free: true, premium: true },
      { feature: 'Watchlist & watch history', free: true, premium: true },
      { feature: 'Upcoming release calendar', free: true, premium: true },
      { feature: 'Discover feed + Top 10 charts', free: true, premium: true },
      { feature: 'Search every movie & show', free: true, premium: true },
      { feature: 'Follow friends & share profile', free: true, premium: true },
      { feature: 'Reminders & where-to-watch', free: true, premium: true },
      { feature: 'Custom lists', free: 'Up to 3', premium: 'Unlimited' },
      { feature: 'Plex sync', free: false, premium: true },
      { feature: 'Trakt sync (Netflix, Prime, Disney+…)', free: false, premium: true },
      { feature: 'Automatic background sync', free: false, premium: true },
    ],
  },

  faq: {
    title: 'Questions',
    items: [
      {
        q: 'Is the Free plan really free?',
        a: 'Yes — no credit card, no trial clock. Track as much as you want on Free for as long as you like.',
      },
      {
        q: 'Can I cancel anytime?',
        a: 'Anytime, in one click from Settings. You keep Premium until the end of the period you already paid for.',
      },
      {
        q: 'What happens to my lists if I downgrade?',
        a: "Nothing is deleted. Your lists stay exactly as they are — you just can't create new ones past the free limit until you upgrade again.",
      },
      {
        q: 'How does sync work?',
        a: 'Connect Plex or Trakt once and PLOT keeps your watchlist and history current automatically — including what you watch on Netflix, Prime, Disney+ and more.',
      },
    ],
  },

  fineprint: 'US, UK and euro customers have fixed local prices. Stripe converts prices for other supported locations at checkout. Cancel anytime. Payments are processed securely by Stripe. Need a hand? contact@theplot.tv',
};
