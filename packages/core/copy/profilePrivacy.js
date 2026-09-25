// Shared copy: who can see what on a profile, and on each custom list. Used by
// the web settings, profile page and list menus, and by mobile's settings,
// u/[username], requests and my-lists screens.
//
// Every sentence here is a claim about access, so it has to match the rules in
// supabase/migrations/20260925120000_unified_profile_visibility.sql:
//   public profile   anyone who isn't blocked
//   private profile  you and accepted followers (signed-in people still see
//                    your name, photo and bio so they can ask to follow)
//   private notes    only ever you
// Reword the policy and this together, never one of them.

export const PROFILE_PRIVACY = {
  publicLabel: 'Profile is public',
  privateLabel: 'Profile is private',
  /** @param {string} favourites Region-spelled plural, from favoriteWords(region).pluralLower. */
  publicDescription: (favourites) =>
    `Anyone can see your watch history, ratings, reviews, Want to Watch, Watching, top picks and ${favourites}.`,
  privateDescription:
    'Only you and followers you approve can see your activity. People signed in can still see your name, photo and bio, and ask to follow you.',
  notesAlwaysPrivate: 'Private notes are only ever visible to you.',

  lockedTitle: 'Private account',
  /** @param {string} name */
  lockedFollow: (name) => `Follow ${name} to see their watch history, ratings and lists.`,
  lockedPending: 'Your follow request is pending. You’ll see their watches, ratings and lists once they approve it.',
  lockedSubPage: 'This profile is private.',
  followRequestsIntro:
    'People asking to follow your private profile. Approving lets them see your watch history, ratings, Want to Watch and any lists you share with followers.',

  sectionsHeading: 'Sections shown',
  sectionsHelp: 'Changes your profile layout. It doesn’t hide anything from people who can see your profile.',

  /** @type {Record<import('../customLists.js').ListVisibility, string>} */
  listVisibility: {
    private: 'Private',
    followers: 'Followers',
    public: 'Public',
    link: 'Anyone with the link',
  },
  /** Compact form for badges on list covers and rows. */
  /** @type {Record<import('../customLists.js').ListVisibility, string>} */
  listVisibilityBadge: {
    private: 'Private',
    followers: 'Followers',
    public: 'Public',
    link: 'Link only',
  },
  /** @type {Record<import('../customLists.js').ListVisibility, string>} */
  listVisibilityHint: {
    private: 'Only you.',
    followers: 'You and your approved followers. Shown on your profile.',
    public: 'Anyone who can see your profile. Shown on your profile.',
    link: 'Anyone you send the link to. Not shown on your profile.',
  },
};
