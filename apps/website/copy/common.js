// Reference-only copy catalog for apps/website (the static marketing site).
// apps/website has no bundler/JS-import step — these files are NOT imported by
// the HTML pages. They exist purely so a future Storybook "Content" page can
// browse what copy is actually live on the site. Keep in sync by hand when the
// HTML changes.
//
// Strings repeated across the nav and footer on every page (index.html,
// about.html, plans.html) live here. Copy used on only one page stays local
// to that page's copy module (see copy/<page>.js).

export const NAV = {
  whatsOn: "What's On",
  pricing: 'Pricing', // only shown in plans.html's own nav
  login: 'Log in',
  signup: 'Sign up',
};

export const FOOTER = {
  home: 'Home',
  whatsOn: "What's On",
  login: 'Log in',
  signup: 'Sign up',
  privacy: 'Privacy',
  terms: 'Terms',
  copyright: (year) => `© ${year} PLOT`,
  socialAria: {
    instagram: 'PLOT on Instagram',
    threads: 'PLOT on Threads',
    x: 'PLOT on X',
  },
};

export const EMAIL_FORM = {
  placeholder: 'your@email.com',
  genericError: 'Something went wrong — try again in a minute.',
};
