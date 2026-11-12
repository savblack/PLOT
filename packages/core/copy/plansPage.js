// Shared plan preview for web and mobile. Planned features are never shown as live entitlements.
// Pricing is US$3/month or US$24/year, taxes included, with a 7-day free trial for new subscribers.
// The first charge is 7 days after the trial starts. Cancel during the trial and the charge is $0.
// Stripe Adaptive Pricing shows the price in local currency at checkout. $24/year is exactly
// four months free against monthly. On web the Upgrade button starts Stripe checkout when
// billing-availability says checkout is open. When it is closed, that button is a waitlist
// mailto instead of a failed checkout; mobile's Upgrade does the same. There is no
// in-app purchase and there will not be one (PLO-526, decided): Premium is bought
// on the web, and mobile's Upgrade opens that web checkout in the browser, only
// where Apple allows a link out (purchaseLinkOut.js).
// The 7-day trial is requested by the stripe-billing checkout, not set on the Stripe Price. It is for
// new subscribers only. Do not put Stripe price IDs in this file.
export const PLANS_PAGE = {
  back: 'Back',
  backToApp: 'Back to Plot',
  // Sans, uppercased by .plans-eyebrow: not the Gabarito wordmark, so it is prose casing.
  eyebrow: 'Plot Premium',
  title: 'Less deciding. More watching.',
  lede: 'A movie that fits your evening. A new episode you won’t miss. Something you both want to watch. Make more of the time you set aside for it.',
  pendingValidation: 'Pending validation',
  limited: 'Limited',
  previewAction: 'Explore Premium',
  // The signed-in link in Settings and the side-nav chip (core/goPremiumLink.js).
  // The trial line is only for someone who has never subscribed, and never on
  // the chip: the side nav stays clean (Savannah, 12 Nov).
  goPremium: {
    trial: 'Go Premium · 7 days free',
    plain: 'Go Premium',
    chip: 'Go Premium',
  },
  tryTasteOverlap: 'Try taste overlap',
  upgradeAction: 'Upgrade to Premium',
  // The same button for someone who has never subscribed, so the 7-day trial
  // applies to them (trialEligible in core/billing.js).
  startTrialAction: 'Start free trial',
  // Shown on web when checkout could not start for a reason other than "not open" or a 503.
  checkoutMessage: 'We couldn’t start checkout. Please try again in a moment.',
  // Closed checkout. The plans page and upgrade sheet show this instead of calling Stripe.
  checkoutClosed: 'Checkout isn’t open yet.',
  checkoutClosedDetail: 'When checkout opens, Premium is US$3/month or US$24/year, taxes included, with a 7-day free trial for new subscribers. You won’t be charged until 7 days after you start. Cancel during the trial and you pay $0.',
  checkoutClosedAnswer: 'Not yet. Checkout isn’t open yet. When it opens, Premium is US$3/month or US$24/year, taxes included, with a 7-day free trial for new subscribers. Join the waitlist and we’ll email you.',
  waitlistAction: 'Join the waitlist',
  waitlistSubject: 'Plot Premium waitlist',
  waitlistHint: 'We’ll email you when checkout opens.',
  // Price config or a billing-account lookup failed. Not the same as a closed launch switch.
  checkoutUnavailable: 'Checkout isn’t available right now. Please try again later.',
  free: {
    name: 'Free',
    price: '$0',
    perpetual: 'forever',
    planNote: 'Free plan, always',
    status: 'Available now',
    tagline: 'Your everyday watching, all in one place.',
    yourCurrentPlan: 'Your current plan',
    includedWithPremium: 'Included with Premium',
    getStartedFree: 'Get started free',
  },
  premium: {
    name: 'Premium',
    price: '$3',
    annualMonthlyPrice: '$2',
    period: '/month',
    // Compact label. Watch together reads this and is left on the shorter form.
    priceSummary: '$3/month or $24/year',
    priceTerms: 'US$3/month or US$24/year, taxes included',
    trialNote: '7-day free trial for new subscribers. You won’t be charged until 7 days after you start. Cancel during the trial and you pay $0.',
    monthlyBilled: 'US$3 billed monthly · taxes included',
    annualBilled: 'US$24 billed yearly · taxes included',
    availability: 'Premium is available now.',
    manageSubscription: 'Manage subscription',
    opening: 'Opening…',
  },
  billing: {
    label: 'Billing period',
    monthly: 'Monthly',
    annual: 'Annual',
    annualBadge: '4 months free',
  },
  // Plan cards. `icon` keys map to the web page's icon set.
  freeIntro: 'Your everyday watching, all in one place:',
  freeCard: [
    { icon: 'track', label: 'Track movies, shows and episodes', note: 'Watch history and episode progress' },
    { icon: 'rate', label: 'Ratings, reviews and private notes', note: 'Remember why you saved something' },
    { icon: 'lists', label: 'Up to five custom lists' },
    { icon: 'discover', label: 'Where to watch and More like this' },
    { icon: 'stats', label: 'Your viewing stats', note: 'Today’s overview stays free' },
  ],
  premiumIntro: 'Everything in Free, plus:',
  premiumCard: [
    { icon: 'pick', label: 'Just Decide', note: 'A shortlist for tonight, sized to your time and services' },
    { icon: 'together', label: 'Find something you both want', note: 'The overlap in your watchlists' },
    { icon: 'lists', label: 'Unlimited and smart lists', note: 'Rules that keep finding matches' },
    { icon: 'stats', label: 'Deeper viewing stats', note: 'Beyond the Free overview' },
    { icon: 'customise', label: 'Customize your Plot', note: 'Every theme, in light and dark' },
  ],
  assurances: [
    '7-day free trial for new subscribers',
    'You won’t be charged until 7 days after you start',
    'Cancel during the trial and you pay $0',
    'Everything free today stays free',
    'Friends join shared lists for free',
  ],
  // In-app upgrade sheet, opened where a Free limit is hit. Each reason names the
  // Premium feature that lifts that limit. `also` picks premiumCard rows by icon;
  // the mobile sheet lists them, the web sheet no longer does.
  upgradeSheet: {
    close: 'Close',
    compare: 'Compare every feature',
    notNow: 'Not now',
    alsoIn: 'Also in Premium',
    // The web sheet, redesigned 11 Nov 2026 (Savannah's pick "A2"): the free
    // trial is the headline and the button, the feature that was tapped is the
    // supporting sentence, and each plan is one row with its real price. A
    // returning subscriber gets no trial, so their sheet leads with the feature
    // and the price line drops the "Then". Mobile still shows the older sheet.
    trialTitle: 'Try Premium free for 7 days.',
    seeAll: 'See everything in Premium',
    planLabel: 'Plan',
    yearlyPrice: '$24 a year',
    monthlyPrice: '$3 a month',
    afterTrial: { yearly: 'Then US$24 a year, taxes included. Cancel anytime.', monthly: 'Then US$3 a month, taxes included. Cancel anytime.' },
    price: { yearly: 'US$24 a year, taxes included. Cancel anytime.', monthly: 'US$3 a month, taxes included. Cancel anytime.' },
    reasons: {
      // Not a limit: the one-time trial prompt (packages/core/premiumTrialPrompt.js),
      // shown once right after onboarding or a Trakt import. The web sheet leads
      // with trialTitle and puts `title` in bold under it; mobile leads with `title`.
      trialAfterOnboarding: {
        context: () => 'You’re all set up',
        title: 'Get even more out of Plot.',
        body: 'Premium adds smart lists, every theme, people alerts and Watch together. Cancel before the 7 days are up and you pay nothing.',
        also: ['lists', 'together'],
      },
      trialAfterTraktImport: {
        context: () => 'Your Trakt history is in',
        title: 'Now make the most of it.',
        body: 'Premium adds smart lists, deeper viewing stats, every theme and Watch together. Cancel before the 7 days are up and you pay nothing.',
        also: ['lists', 'stats'],
      },
      lists: {
        context: (cap) => `You’ve used all ${cap} free lists`,
        title: 'Make a list for every kind of night.',
        body: 'Premium brings unlimited custom lists, plus smart lists that keep finding matches. The lists you have now stay exactly as they are.',
        also: ['pick', 'together'],
      },
      // Opened from the Settings theme picker. A picture of the family, never applied.
      themes: {
        context: () => 'Themes are part of Premium',
        title: 'Give plot a new look.',
        body: 'Premium adds themes, each in light and dark with its own accent. The default look stays free in light, dark and system.',
        also: ['pick', 'together'],
      },
      smartLists: {
        context: () => 'Smart lists come with Premium',
        title: 'Lists that fill themselves.',
        body: 'Save a few rules, like comedies from the 2010s on your services, and the list keeps finding matches, including new discoveries.',
        // B5: shown when a Free viewer built rules and pressed Create.
        kept: 'Your rules are kept. The list is ready as soon as you have Premium.',
        also: ['pick', 'together'],
      },
      // A Free list owner choosing Invite people. Only the host needs Premium.
      collaborativeLists: {
        context: () => 'Collaborative lists are part of Premium',
        title: 'Build a list together.',
        body: 'Send a link and anyone can add titles to your list. Only you need Premium. Friends join with a free account.',
        also: ['together', 'lists'],
      },
      // Opened from Customize Home when a Free viewer tries to pin a shelf.
      pins: {
        context: () => 'Pinned shelves are part of Premium',
        title: 'Put what you care about first.',
        body: 'Pin your watchlist, a list, or someone you follow to the top of Home. Your shelves and their order stay free.',
        also: ['pick', 'together'],
      },
      alerts: {
        context: (_cap) => 'Following people is part of Premium',
        title: 'Follow the people you love watching.',
        body: 'Hear when they have something new.',
        also: ['pick', 'together'],
      },
      // Opened from the whole-season alert toggle on a show. Following people is `alerts`.
      seasonAlerts: {
        context: () => 'Whole-season alerts are part of Premium',
        title: 'Know when the whole season is ready.',
        body: 'Premium tells you when every episode of a season is on your services, so you can watch it straight through.',
        also: ['pick', 'together'],
      },
      // The reasons below were added with the design audit (pick 3.2 A): every
      // Premium gate opens this one sheet. Each used to go somewhere different:
      // straight to the plans page with no explanation, through a confirm box,
      // or to a one-off card.
      // "Customize artwork" on a title, for a Free viewer.
      artwork: {
        context: () => 'Custom artwork is part of Premium',
        title: 'Choose the artwork you like best.',
        body: 'Pick the poster and backdrop for any title. Your choice shows wherever that title appears for you.',
        also: ['pick', 'together'],
      },
      // A stat tile or the genre link on History, for a Free viewer.
      stats: {
        context: () => 'Deeper stats are part of Premium',
        title: 'See the titles behind your numbers.',
        body: 'Open any stat on your History page to see what is behind it, like everything you watched on a Monday or every mystery this year.',
        also: ['pick', 'together'],
      },
      // The taste overlap page, for a Free viewer.
      tasteOverlap: {
        context: () => 'Taste overlap is part of Premium',
        title: 'Compare your taste with someone you follow.',
        body: 'See your match, the genres you share and where you disagree.',
        also: ['pick', 'together'],
      },
      // Subscribe to calendar, from a title's Add to calendar menu or Settings.
      calendarFeed: {
        context: () => 'A live calendar feed is part of Premium',
        title: 'Your releases, in your own calendar.',
        body: 'Add it once and a private link keeps upcoming releases up to date in your calendar app. The one-time snapshot stays free.',
        also: ['pick', 'together'],
      },
      // Turning on automatic imports for a connected source in Settings.
      autoImport: {
        context: () => 'Automatic imports are part of Premium',
        title: 'Keep your history up to date by itself.',
        body: 'Plot checks your account every day and brings new watches in. One-off imports stay free.',
        also: ['pick', 'together'],
      },
      // Just Decide, once a Free viewer has used the day's free pick.
      justDecide: {
        context: () => 'That was today’s free pick',
        title: 'A shortlist every time you ask.',
        body: 'Answer a few quick questions and get a shortlist that fits your mood, your time and your services. Can’t decide? Surprise me picks one for you.',
        also: ['together', 'lists'],
      },
      // Watch together, when nobody in the pairing has Premium.
      watchTogether: {
        context: () => 'Deciding together is part of Premium',
        title: 'Find something you both want to watch.',
        body: 'Plot lines up what is on both your watchlists and you swipe until you match. Inviting and accepting are free, and only one of you needs Premium.',
        also: ['pick', 'lists'],
      },
      // Opened from the Also email me row in Settings > Viewing (ALERT_EMAIL_ENABLED).
      alertEmail: {
        context: () => 'Email alerts are part of Premium',
        title: 'Get your watchlist alerts in your inbox.',
        body: 'Premium can also email you when a film on your watchlist lands on one of your services or becomes free to watch. Alerts in the app stay free.',
        also: ['pick', 'together'],
      },
    },
  },
  host: {
    title: 'Only the host needs Premium.',
    body: 'Start a collaborative list or a shared watch session and invite anyone. Friends can add ideas with a free account.',
    // Live on web (PLO-525): Premium hosts invite by link, Free friends join.
    // Mobile parity: #1089.
    status: 'New',
    you: 'You',
  },
  // Every cell is true (tick), false (dash) or a short value. `tag` is an optional note after the label.
  comparison: {
    title: 'Compare every feature',
    filter: 'Show only what Premium adds',
    featureHeader: 'Feature',
    freeHeader: 'Free',
    premiumHeader: 'Premium',
    included: 'Included',
    notIncluded: 'Not included',
    groups: [
      { title: 'Choosing what to watch', rows: [
        { label: 'Discovery, search and where to watch', free: true, premium: true },
        { label: 'More like this', free: true, premium: true },
        { label: 'Just Decide', free: false, premium: true },
        { label: 'Find something you both want to watch', free: true, premium: true, tag: 'Free if one of you has Premium' },
      ] },
      { title: 'Watching with others', rows: [
        { label: 'Follow friends and share profiles', free: true, premium: true },
        { label: 'Join shared lists and watch sessions', free: true, premium: true, tag: 'Free with a Premium host' },
        { label: 'Create collaborative lists', free: false, premium: true },
      ] },
      { title: 'Keeping track', rows: [
        { label: 'Movies, shows and episode progress', free: true, premium: true },
        { label: 'Watchlist, ratings, reviews and private notes', free: true, premium: true },
        { id: 'fullStats', label: 'Viewing stats', free: 'Overview', premium: 'Deeper' },
        { label: 'Import history from your other apps', free: true, premium: true },
      ] },
      { title: 'Lists', rows: [
        { label: 'Custom lists', free: '5', premium: 'Unlimited' },
        { label: 'Smart lists', free: false, premium: true },
      ] },
      { title: 'Staying up to date', rows: [
        { label: 'Release calendar', free: true, premium: true },
        { label: 'New episode notifications', free: true, premium: true, tag: 'In the app' },
        { label: 'Live calendar subscription', free: false, premium: true },
        { label: 'Actor and director alerts', free: false, premium: true },
        { label: 'Whole-season-ready alerts', free: false, premium: true },
        { label: 'Streaming alerts for your watchlist', free: true, premium: true, tag: 'In the app' },
        { label: 'Email alerts', free: false, premium: true },
      ] },
      { title: 'Make it yours', rows: [
        { label: 'Themes', free: 'Default, light and dark', premium: 'Every theme' },
      ] },
    ],
  },
  freeFeatures: [
    { id: 'tracking', label: 'Movie and TV tracking, watch history and episode progress' },
    { id: 'watchlist', label: 'Watchlist, ratings and reviews' },
    { id: 'notes', label: 'Private watchlist notes',
      description: 'Keep a private reminder of why you saved a title, separate from your reviews.' },
    { id: 'customLists', label: 'Up to five custom lists',
      description: 'Create up to five custom lists for free.' },
    { id: 'discovery', label: 'Discovery, search, where to watch, and More like this',
      description: 'Browse what’s on, search titles, and see similar titles on a title page. Plot does not offer personally tailored recommendations.' },
    { id: 'statistics', label: 'Your viewing statistics', freeValue: 'Limited',
      description: 'The stats in the app today stay free. Premium adds deeper stats, starting with taste overlap.' },
    { id: 'calendar', label: 'In-app release calendar and downloadable calendar snapshot' },
    { id: 'social', label: 'Follow friends and share profiles' },
    { id: 'episodeAlerts', label: 'New episode notifications',
      description: 'See a notification in the app when a new episode of a show you follow comes out.' },
    { id: 'streamingAlerts', label: 'Streaming alerts for your watchlist',
      description: 'See a notification in the app when a film on your watchlist lands on one of your services, or becomes free to watch. Mute a film, or turn them all off, any time.' },
    { id: 'participation', label: 'Join collaborative lists and shared watch sessions',
      description: 'Join for free. For watching together, only one of you needs Premium; for a collaborative list, only the person who made it does.' },
    { id: 'imports', label: 'Manual imports and data exports',
      description: 'Import watch history yourself and export your data.' },
  ],
  customLists: (cap) => `Currently up to ${cap} custom lists`,
  premiumFeatures: [
    { id: 'watchTogether', label: 'Find something you both want to watch', highlight: true,
      description: 'Find the overlap in your watchlists, then swipe through it together until you both say yes. Only one of you needs Premium, so the other person joins for free. Invite anyone with a link.' },
    { id: 'filmPicker', label: 'Just Decide', highlight: true,
      description: 'Choose a movie or a show, how much time you have and the services you use. Get five options for tonight, or let a random pick make the decision.' },
    { id: 'fullStats', label: 'Deeper viewing stats', highlight: true,
      description: 'Additional stats beyond the Free overview you already have, starting with taste overlap: see how your ratings line up with anyone you follow.' },
    { id: 'collaborativeLists', label: 'Create collaborative lists', highlight: true, live: true,
      description: 'Build your next movie night together. Invite friends to add titles, even when they use Free.' },
    { id: 'unlimitedLists', label: 'Unlimited custom lists', highlight: true,
      description: 'A list for every mood, theme and movie marathon, with no limit on how many you create.' },
    { id: 'smartLists', label: 'Smart lists, including new discoveries', live: true,
      description: 'Save filter rules that automatically update your lists, including discoveries beyond your saved titles.' },
    { id: 'calendarSubscription', label: 'Live calendar subscription', live: true,
      description: 'Keep upcoming releases updated in your calendar app automatically.' },
    { id: 'peopleAlerts', label: 'Actor and director release alerts', live: true,
      description: 'Follow the people you love watching and hear about their new releases.' },
    { id: 'seasonReady', label: 'Whole-season-ready alerts', live: true,
      description: 'Know when every episode is verified available on your selected services in your region. Airing dates alone do not qualify.' },
    // Email is not live yet (it needs an unsubscribe link and a registered
    // address first; see docs/launch/app-store-launch-sprint.md). In-app
    // streaming alerts and push notifications are Free (see the comparison
    // rows); this is the Premium way to also get alerts in your inbox.
    { id: 'emailAlerts', label: 'Email alerts',
      description: 'Get your watchlist alerts in your inbox, as well as in the app.' },
    { id: 'themes', label: 'Themes', live: true,
      description: 'Themes, each in light and dark with its own accent. The default look stays free in light, dark and system.' },
  ],
  planSummary: ['Pick a movie or show by time and service', 'Deeper viewing stats', 'Every theme, in light and dark'],
  requests: {
    title: 'What would make Premium worth it for you?',
    description: 'Tell us what you’d love to see included.',
    action: 'Suggest a Premium feature',
    hint: 'Opens your email app.',
    subject: 'Plot Premium feature request',
  },
  faqTitle: 'Before you ask',
  faqs: [
    // `closed` swaps the answer for checkoutClosedAnswer while checkout is shut.
    { q: 'Can I upgrade now?', closed: true, a: 'Yes. Choose Monthly or Annual, then Start free trial, or Upgrade to Premium if you have subscribed before. Premium is US$3/month or US$24/year, taxes included, with a 7-day free trial for new subscribers. You won’t be charged until 7 days after you start. Cancel during the trial and you pay $0.' },
    { q: 'What happens to Free?', a: 'Your current free features stay available, including private watchlist notes, five custom lists, today’s limited viewing stats, and More like this on a title. Free does not include personally tailored recommendations.' },
    { q: 'What does Just Decide actually do?', a: 'It asks four quick questions: movie or show, how long you’ve got, what kind of story, and how new or how good. You get a shortlist of up to five, and you can limit it to your streaming services or your watchlist. Can’t decide? Surprise me gives you one pick.' },
    { q: 'Can my friends join without Premium?', a: 'Yes. To find something you both want to watch, only one of you needs Premium, so the other person joins for free. Anyone can send an invite. Collaborative lists work the same way: only the person who makes the list needs Premium.' },
    { q: 'How many lists are included in Free?', a: 'Free includes up to five custom lists.' },
    { q: 'Can I get a refund?', a: 'The 7-day free trial is there so you can try Premium before you pay, so charges after the trial aren’t refundable and we don’t refund partial months or years. Cancel anytime and keep Premium until the end of the period you’ve paid for. If you think you were charged by mistake, email support@theplot.tv within 14 days and we’ll look into it. Your consumer-law rights still apply.' },
    { q: 'What currency will I pay in?', a: 'Prices are in US dollars and include tax. At checkout, Stripe shows the price in your local currency, so you see the exact amount before you pay.' },
    { q: 'Are these alerts available now?', a: 'Live calendar subscription is available with Plot Premium. A private link keeps upcoming releases updated in your calendar app. Actor and director release alerts and whole-season-ready alerts are available with Plot Premium on the web. Premium themes are available. Deeper stats include taste overlap, which is available with Premium. Whole-season alerts need verified availability for every episode on your selected service. Streaming alerts for films on your watchlist are free and arrive in the app.' },
  ],
  fineprint: 'Prices in US dollars, taxes included. Premium has a 7-day free trial for new subscribers. You won’t be charged until 7 days after you start. Cancel during the trial and you pay $0. At checkout, Stripe shows the price in your local currency. Payments are processed securely by Stripe. Need a hand? support@theplot.tv',
  terms: 'Terms',
  privacy: 'Privacy',
};
