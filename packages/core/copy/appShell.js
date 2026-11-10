// Shared copy: used by the web app and the mobile header, tab bar and drawer.
// Lives in @plot/core/copy so the two platforms can't drift word by word;
// apps/web/src/copy/appShell.js re-exports it so src/copy stays the single place
// the web app and the Storybook Content page look for copy.

export const APP_SHELL = {
  openMenu: 'Open menu',
  closeMenu: 'Close menu',
  collapseNavigation: 'Collapse navigation',
  expandNavigation: 'Expand navigation',
  goToHome: 'Go to home',
  notifications: 'Notifications',
  openSearch: 'Open search',
  search: 'Search',
  scrollToTop: 'Scroll to top',
  scrollRailLeft: 'Scroll left',
  scrollRailRight: 'Scroll right',
  profile: 'Profile',
  beta: 'Beta',
  // Marks a Premium nav destination for Free viewers.
  premium: 'Premium',
  viewYourProfile: 'View your profile',
  // Accessible name of the desktop sidebar's account menu (the profile row opens it).
  accountMenu: 'Account',
  helpBuild: 'Help build Plot',
  giveFeedback: 'Give feedback',
  opensNewTab: 'opens in a new tab',
  // Temporary service notice shown at the top of every app page (web:
  // components/ServiceNotice.jsx). The marketing site cannot import this, so
  // apps/website/js/site-notice.js carries the same sentence: change both.
  // Set to '' to hide the app notice.
  serviceNotice: "We're seeing more traffic than usual and are upgrading our systems to keep up. You may run into issues importing your watch history or saving titles in the app while we do. Thanks for your patience.",
};
