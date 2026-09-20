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
  viewYourProfile: 'View your profile',
  helpBuild: 'Help build PLOT',
  giveFeedback: 'Give feedback',
  opensNewTab: 'opens in a new tab',
};
