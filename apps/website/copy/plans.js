// Reference-only copy catalog for apps/website/pricing.html. Not imported by
// the HTML — see copy/common.js for how this catalog is used.
//
// Note: the page's CSS also styles .tmony (testimonials) and .social-stats
// blocks, but neither has any actual markup/content in pricing.html today —
// nothing to catalog there.

export const PLANS_PAGE = {
  meta: {
    title: 'Plans & Pricing — plot',
    description: 'plot is free to use, forever. Premium is $3/month or $24/year with a 7-day free trial for new subscribers.',
    ogDescription: 'Free to use, forever. Premium is $3/month or $24/year with a 7-day free trial for new subscribers.',
  },

  hero: {
    pageLabel: 'Plans',
    h1: 'Free forever. Premium when you want more.',
    lede: 'Free keeps track. Premium helps you decide what to watch next. Skip the scroll, the first week is on us.',
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
    tagline: 'Everything you need to organize your watching.',
    features: [
      'Track movies & TV in one place',
      'Watchlist, history & release calendar',
      'Discover feed + Top 10 charts',
      'Up to 5 custom lists',
      'Follow friends & share your profile',
    ],
    cta: 'Start tracking',
  },

  premiumPlan: {
    name: 'Premium',
    // Amount/billed line are recalculated by JS when the billing toggle
    // changes; these are the initial (annual) values rendered in the HTML.
    amount: '$2',
    per: '/mo',
    billed: 'Billed $24 once a year',
    billedMonthly: 'Billed monthly. Cancel anytime.',
    flag: '7-day free trial',
    trial: 'Commitment-free. Cancel during the trial and you pay $0.',
    tagline: 'Everything in Free, plus:',
    features: [
      'Pick for me: a shortlist for tonight',
      'Watch together: settle what to watch',
      'Your watch profile',
      'Custom themes, widgets and app icons',
      'Unlimited and smart lists',
      'Release dates in your calendar app',
      'Actor and director alerts',
    ],
    cta: 'Start 7-day free trial',
  },

  // "Less deciding. More watching." — one benefit at a time with a product
  // visual beside it (the stories switcher). The three smaller benefits sit
  // in pills beneath.
  premiumStories: {
    eyebrow: 'Plot Premium',
    h2: 'Less deciding. More watching.',
    steps: [
      { label: 'Tonight', h3: 'Find tonight’s movie in four taps', body: 'How long have you got, where do you watch, what are you in the mood for? Pick for me turns that into a shortlist, on the services you already pay for.' },
      { label: 'Together', h3: 'Settle movie night before the snacks are ready', body: 'Watch together finds the overlap in your watchlists and gets everyone to a yes. Only one of you needs Premium.' },
      { label: 'Your profile', h3: 'Get to know your taste', body: 'Your watch profile shows what you really watch, how much, and who you line up with. Settle who has the best taste.' },
      { label: 'Yours', h3: 'Your Plot, your style', body: 'Custom themes, home-screen widgets and app icons. Make it feel like yours.' },
    ],
    cta: 'Start 7-day free trial',
    alsoLabel: 'Also in Premium',
    also: ['Unlimited and smart lists', 'Release dates in your calendar app', 'Actor and director alerts'],
  },

  comparison: {
    title: 'Compare plans',
    note: 'Nothing is deleted if you downgrade. Your lists stay exactly as they are.',
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
      { feature: 'Smart lists', free: false, premium: true },
      { feature: 'Release dates in your calendar app', free: false, premium: true },
      { feature: 'Pick for me', free: false, premium: true },
      { feature: 'Watch together', free: false, premium: true },
      { feature: 'Your watch profile', free: 'Overview', premium: 'Full profile' },
      { feature: 'Custom themes, widgets & app icons', free: false, premium: true },
      { feature: 'Actor & director alerts', free: false, premium: true },
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
        a: 'Yes. Choose Monthly or Annual and start your free trial in Plot. Premium is $3/month or $24/year with a 7-day free trial for new subscribers. You won’t be charged until 7 days after you start. Cancel during the trial and you pay $0.',
      },
      {
        q: 'Can I cancel anytime?',
        a: 'Yes. Cancel during the 7-day trial and you pay $0. After the trial, cancel from Manage subscription in Settings and keep Premium until the end of the period you’ve paid for.',
      },
      {
        q: 'Can I get a refund?',
        a: 'The 7-day free trial is there so you can try Premium before you pay, so charges after the trial aren’t refundable and we don’t refund partial months or years. Cancel anytime and keep Premium until the end of the period you’ve paid for. If you think you were charged by mistake, email support@theplot.tv within 14 days and we’ll look into it. Your consumer-law rights still apply.',
      },
      {
        q: 'What happens to my lists if I downgrade?',
        a: 'Nothing is deleted. Your lists stay exactly as they are. You just can’t create new ones past the free limit until you upgrade again.',
      },
    ],
  },

  fineprint: 'Prices are in US dollars and include tax. Premium has a 7-day free trial for new subscribers. You won’t be charged until 7 days after you start. Cancel during the trial and you pay $0. Your total and billing currency are shown at checkout. Payments are processed securely by Stripe. Need a hand? support@theplot.tv',
};
