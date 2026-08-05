// Shared copy: used by the web app and mobile's ProfileBadges in components/Avatar.tsx.
// Lives in @plot/core/copy so the two platforms can't drift word by word;
// apps/web/src/copy/profileBadges.js re-exports it so src/copy stays the single place
// the web app and the Storybook Content page look for copy.

// Labels for the badges that sit next to a display name. Both are read by
// screen readers, so they have to say what the badge means, not what it looks
// like ("Supporter", never "pink heart").

export const PROFILE_BADGES = {
  premium: 'PLOT Premium',
  supporter: 'Supporter',
};
