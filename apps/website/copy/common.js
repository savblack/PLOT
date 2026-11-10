// Reference-only copy catalog for apps/website (the static marketing site).
// apps/website has no bundler/JS-import step — these files are NOT imported by
// the HTML pages. They exist purely so a future Storybook "Content" page can
// browse what copy is actually live on the site. Keep in sync by hand when the
// HTML changes.
//
// Strings repeated across the nav and footer on every page (index.html,
// about.html, pricing.html) live here. Copy used on only one page stays local
// to that page's copy module (see copy/<page>.js).

export const NAV = {
  whatsOn: "What's On",
  pricing: 'Pricing', // pricing.html's nav and the footer
  login: 'Log in',
  signup: 'Sign up',
};

// Temporary banner injected at the top of every page by js/site-notice.js.
// Same sentence as APP_SHELL.serviceNotice in packages/core/copy/appShell.js.
export const SITE_NOTICE = "We're seeing more traffic than usual and are upgrading our systems to keep up. You may run into issues importing your watch history or saving titles in the app while we do. Thanks for your patience.";

export const FOOTER = {
  tagline: ["Everything you've watched.", 'Everything you want to watch.'],
  cta: 'Start your plot',
  login: 'Log in',
  headings: { explore: 'Explore', company: 'Company', legal: 'Legal' },
  whatsOn: "What's On",
  pricing: 'Pricing',
  about: 'About',
  community: 'Community',
  support: 'Support',
  changelog: 'Changelog',
  privacy: 'Privacy',
  terms: 'Terms',
  wordmarkAria: 'plot home',
  copyright: (year) => `© ${year} plot`,
  socialAria: {
    instagram: 'plot on Instagram',
    threads: 'plot on Threads',
    x: 'plot on X',
  },
};

export const EMAIL_FORM = {
  placeholder: 'your@email.com',
  genericError: 'Something went wrong — try again in a minute.',
};
