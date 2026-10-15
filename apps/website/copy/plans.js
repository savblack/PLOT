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
    lede: 'Free keeps track. Premium helps you decide what to watch next. Skip the endless scroll, the first week is on us.',
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
  // in pills beneath. The Taste match heading carries an <s> strike-through
  // ("science" struck, "cinema" stays); the HTML gives it an aria-label.
  premiumStories: {
    eyebrow: 'Plot Premium',
    h2: 'Less deciding. More watching.',
    steps: [
      { label: 'Pick for me', h3: 'Something to watch, in under a minute.', body: 'How long have you got, what are you in the mood for, where are you watching? Plot’s got your shortlist, sorted.' },
      { label: 'Watch together', h3: 'Settle movie night before the snacks are ready.', body: 'Watch together analyzes everyone’s Plot profiles to find movie and TV matches in your lists.' },
      { label: 'Your profile', h3: 'Every story has a plot. Here’s yours.', body: 'Every film and show you log adds up to a profile: the genres you lean on, the hours you’ve put in, and the titles you keep going back to.' },
      { label: 'Taste match', h3: 'Find out your compatibility based on <s>science</s> cinema.', body: 'A compatibility score built from the movies and shows you’ve both rated. Plot does the math and tells you how compatible you really are, plus the films you agree on and the ones that are still a sore point.' },
      { label: 'Make it yours', h3: 'Your Plot, your way.', body: 'Light, dark or in between. Widgets for your home screen. Customize your Plot app interface and icon. Plot, the way you’d have made it.' },
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
      { feature: 'Taste match with a friend', free: false, premium: true },
      { feature: 'Custom themes, widgets & app icons', free: false, premium: true },
      { feature: 'Actor & director alerts', free: false, premium: true },
    ],
  },

  faq: {
    title: 'Questions',
    lede: 'Short answers. Anything else, email us.',
    groups: [
      {
        label: 'Plans',
        items: [
          { q: 'Is Free really free?', a: 'Yes. No card, no trial clock, no limit on what you track. Free keeps your watchlist, history, release calendar and up to five lists for as long as you like.' },
          { q: 'What do I get with Premium?', a: 'Everything in Free, plus Pick for me, Watch together, your watch profile, Taste match, custom themes, widgets and app icons, unlimited and smart lists, release dates in your calendar app, and actor and director alerts. The table above has the full list.' },
          { q: 'Does my friend need Premium too?', a: 'No. For Watch together and Taste match, only one of you needs Premium.' },
          { q: 'What happens to my lists if I downgrade?', a: 'Nothing is deleted. Your lists stay exactly as they are. You just can’t create new ones past the free limit until you upgrade again.' },
        ],
      },
      {
        label: 'Billing',
        items: [
          { q: 'How does the free trial work?', a: 'Start Premium and the first 7 days are free. You won’t be charged until the trial ends, we’ll email you 3 days before it does, and if you cancel during the trial you pay $0. The trial is for new subscribers.' },
          { q: 'Can I switch between monthly and annual?', a: 'Yes, any time, from Manage subscription in Settings. If you switch during your trial, the trial carries on.' },
          { q: 'Can I cancel anytime?', a: 'Yes. Cancel from Manage subscription in Settings and keep Premium until the end of the period you’ve paid for.' },
          { q: 'Can I get a refund?', a: 'The trial is there so you can try Premium before you pay, so charges after it aren’t refundable and we don’t refund partial months or years. If you think you were charged by mistake, email support@theplot.tv within 14 days and we’ll look into it. Your consumer-law rights still apply.' },
          { q: 'What currency am I charged in?', a: 'Prices are in US dollars and include tax. Your total and billing currency are shown at checkout before you confirm.' },
          { q: 'How do you take payment?', a: 'Securely, through Stripe. Plot never sees or stores your card details.' },
          { q: 'Something else?', a: 'Email support@theplot.tv and a person will get back to you.' },
        ],
      },
    ],
  },

};
