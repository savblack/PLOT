// Reference-only copy catalog for apps/website/_partials/footer.html — the
// shared footer injected into every page (index.html, about.html, plans.html,
// via `npm run footer`). Not imported by the HTML.
//
// Every string here is identical to copy/common.js's FOOTER export (the
// footer partial and each page's own <nav> share the same link labels) — this
// file exists as a 1:1 mirror of the partial for anyone browsing by source
// file, rather than re-deriving new copy. Edit copy/common.js first, then
// mirror the change here.

export const FOOTER_PARTIAL = {
  logo: 'PLOT',
  nav: {
    home: 'Home',
    whatsOn: "What's On",
    login: 'Log in',
    signup: 'Sign up',
    privacy: 'Privacy',
    terms: 'Terms',
  },
  copyright: (year) => `© ${year} PLOT`,
  socialAria: {
    instagram: 'PLOT on Instagram',
    threads: 'PLOT on Threads',
    x: 'PLOT on X',
  },
};
