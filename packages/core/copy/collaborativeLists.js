// Collaborative lists: the host needs Premium, friends join free (PLO-525).
// Shared by web and mobile. Rules: packages/core/listInvites.js. Strings the
// Watch together catalog already owns (Copy, Share link, Invite link, Reset invite link,
// the list summary line, the sign-up buttons, the generic error) are read
// from there, not repeated here. The dialog title is `invite`.

export const COLLABORATIVE_LISTS = Object.freeze({
  invite: 'Invite people',

  dialog: {
    body: 'Anyone with the link can join and add titles for free. Only you need Premium.',
    shareTitle: (listName) => `Add ideas to ${listName}`,
    shareText: 'Join my list on Plot and add what you want to watch.',
    resetNote: 'Links you’ve already sent stop working. Everyone already on the list stays on it.',
    partnersLabel: 'People you watch together with',
    partnersNote: 'They join straight away and get a notification.',
  },

  hostNeedsPremium: 'This list can’t take new people right now. Its creator needs Premium to invite anyone. Everyone already on it can keep adding titles.',

  landing: {
    title: (owner) => `${owner} invited you to a list`,
    body: 'Join to add titles and see what everyone else has added. It’s free.',
    bodyNew: (owner) => `Plot keeps track of what you watch. Join for free and add your ideas to ${owner}’s list.`,
    join: 'Join list',
    joinNote: (owner) => `Joining doesn’t follow ${owner}. You can leave the list any time.`,
    ownerTitle: 'This is your list’s invite link',
    ownerBody: 'Send it to anyone you want adding ideas.',
    memberTitle: 'You’re already on this list',
    open: 'Open list',
    inactiveTitle: 'This list isn’t taking new people',
    inactiveBody: (owner) => `${owner} needs Premium to invite people to a list. Once they have it, this link works again.`,
  },

  errors: {
    premium_required: 'This list isn’t taking new people right now.',
    not_allowed: 'This invite doesn’t work for your account.',
  },
});
