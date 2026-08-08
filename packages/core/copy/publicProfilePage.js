// Shared copy: used by the web app and mobile's app/(app)/u/[username].tsx.
// Lives in @plot/core/copy so the two platforms can't drift word by word;
// apps/web/src/copy/publicProfilePage.js re-exports it so src/copy stays the single place
// the web app and the Storybook Content page look for copy.

export const PUBLIC_PROFILE_PAGE = {
  followersTitle: 'Followers',
  followingTitle: 'Following',
  noFollowersYet: 'No followers yet.',
  notFollowingAnyoneYet: 'Not following anyone yet.',
  usernameTaken: 'That username is taken.',
  usernameRule: '3-30 characters: letters, numbers, hyphens.',
  saveFailed: 'Couldn’t save. Please try again.',
  saving: 'Saving…',
  saveDisplayName: 'Save display name',
  editDisplayName: 'Edit display name',
  saveUsername: 'Save username',
  editUsername: 'Edit username',
  requestToFollow: 'Request to follow',
  follow: 'Follow',
  editProfile: 'Edit profile',
  namePlaceholder: 'Your name',
  bioPlaceholder: 'A little about you',
  shareProfile: 'Share profile',
};
