export const PLANS_PAGE = {
  back: '← Back',
  eyebrow: 'Pricing',
  title: 'Do more with everything you watch',
  lede: 'Start free and keep every movie and show in one place. Go Premium for unlimited lists and automatic sync from every service you use.',

  billingGroupLabel: 'Billing period',
  monthly: 'Monthly',
  annual: 'Annual',
  savePct: (pct) => `Save ${pct}%`,

  free: {
    name: 'Free',
    perpetual: 'forever',
    tagline: 'Everything you need to organise your watching.',
    highlights: [
      'Track movies & TV in one place',
      'Watchlist, history & release calendar',
      'Discover feed + Top 10 charts',
      'Follow friends & share your profile',
    ],
    customListCap: (cap) => `Up to ${cap} custom lists`,
    includedWithPremium: 'Included with Premium',
    yourCurrentPlan: 'Your current plan',
    getStartedFree: 'Get started free',
  },

  premium: {
    recommended: 'Recommended',
    name: 'Premium',
    perMonth: '/mo',
    billedYearly: (price, pct) => `Billed A$${price} yearly · save ${pct}%`,
    billedMonthly: 'Billed monthly',
    everythingInFreePlus: 'Everything in Free, plus:',
    highlights: {
      unlimitedLists: 'Unlimited custom lists',
      plexSync: 'Auto-sync your watchlist & history from Plex',
      traktSync: 'Sync Netflix, Prime, Disney+ & more via Trakt',
      alwaysUpToDate: 'Everything stays up to date, automatically',
    },
    opening: 'Opening…',
    manageSubscription: 'Manage subscription',
    goPremium: 'Go Premium',
  },

  onPremiumNote: 'You’re on PLOT Premium. Enjoy the full experience.',

  comparison: {
    included: 'Included',
    notIncluded: 'Not included',
    title: 'Compare plans',
    featureHeader: 'Feature',
    freeHeader: 'Free',
    premiumHeader: 'Premium',
    unlimited: 'Unlimited',
    customListCapShort: (cap) => `Up to ${cap}`,
    rows: {
      track: 'Track movies & TV',
      watchlist: 'Watchlist & watch history',
      calendar: 'Upcoming release calendar',
      discover: 'Discover feed + Top 10 charts',
      search: 'Search every movie & show',
      social: 'Follow friends & share profile',
      reminders: 'Reminders & where-to-watch',
      customLists: 'Custom lists',
      plexSync: 'Plex sync',
      traktSync: 'Trakt sync (Netflix, Prime, Disney+…)',
      autoSync: 'Automatic background sync',
    },
  },

  faqTitle: 'Questions',
  faqs: {
    isFreeReallyFree: {
      q: 'Is the Free plan really free?',
      a: 'Yes. No credit card, no trial clock. Track as much as you want on Free for as long as you like.',
    },
    cancelAnytime: {
      q: 'Can I cancel anytime?',
      a: 'Anytime, in one click from Settings. You keep Premium until the end of the period you already paid for.',
    },
    downgradeLists: {
      q: 'What happens to my lists if I downgrade?',
      a: 'Nothing is deleted. Your lists stay exactly as they are. You just can’t create new ones past the free limit until you upgrade again.',
    },
    howSyncWorks: {
      q: 'How does sync work?',
      a: 'Connect Plex or Trakt once and PLOT keeps your watchlist and history current automatically, including what you watch on Netflix, Prime, Disney+ and more.',
    },
  },

  finePrint: 'US, UK and euro customers have fixed local prices. Stripe converts prices for other supported locations at checkout.',
  finePrintCancel: 'Cancel anytime. Payments are processed securely by Stripe.',
  finePrintContact: 'Need a hand?',

  terms: 'Terms',
  privacy: 'Privacy',
};
