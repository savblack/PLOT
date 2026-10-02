// Collaborative lists: the host needs Premium, friends join free (PLO-525).
// Shared by web and mobile. Rules: packages/core/listInvites.js. Strings the
// Watch together catalog already owns (Copy, Share link, Invite link, Reset invite link,
// the list summary line, the sign-up buttons, the generic error) are read
// from there, not repeated here. The dialog title is `invite`.
//
// The redesign (2 Oct 2026, Savannah's picks from the collaborative lists
// canvas) adds `myLists` (B1 with A1's menu), `create` (B2), `startWith` (C2),
// the list-led landing (B3, B4, B7) and `page` (B5 merged with A5, and A8).

import { joinNames } from '../sharedLists.js';

const titles = (n) => `${n} ${n === 1 ? 'title' : 'titles'}`;

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

  // My Lists (B1), and the ⋯ menu on every list cover (A1).
  myLists: {
    shared: 'Shared',
    sharedNote: 'Lists you and friends add to',
    sharedByMe: 'Shared by me',
    sharedWithMe: 'Shared with me',
    newShared: 'New shared list',
    newSharedNote: 'Friends add for free',
    // Under a list you started: who else is on it.
    withNames: (names) => joinNames(names),
    // Under a list you were invited to: whose it is.
    from: (owner) => `From ${owner}`,
    listOptions: (name) => `Options for ${name}`,
    rename: 'Rename list',
    renameTitle: 'Rename list',
    share: 'Share',
    delete: 'Delete list',
  },

  // New shared list (B2). The invite link needs the list to exist, so the
  // sheet makes it first and then opens the Invite people dialog on it.
  create: {
    title: 'New shared list',
    name: 'List name',
    namePlaceholder: 'e.g. Friday film club',
    people: 'Add people you watch together with',
    peopleNote: 'They join straight away and get a notification.',
    added: 'Added',
    linkNote: 'Next, you get a link anyone can join with for free, even without a Plot account.',
    notify: (names) => `${joinNames(names)} ${names.length === 1 ? 'gets' : 'get'} a notification.`,
    create: 'Create list',
  },

  // Start a list from a friend's profile (C2).
  startWith: {
    action: (name) => `Start a list with ${name}`,
    body: (name) => `A list you both add to. ${name} joins for free.`,
  },

  // A shared list's own page (B5 with A5's header merged into its people
  // panel) and the phone layout (A8).
  page: {
    onThisList: 'On this list',
    // "You, Sam, Priya and Jo · 12 titles"
    summary: (names, n) => `${joinNames(names)} · ${titles(n)}`,
    // "4 people · 12 titles", the phone line above the grid
    countSummary: (people, n) => `${people} ${people === 1 ? 'person' : 'people'} · ${titles(n)}`,
    sharedByYou: 'Shared by you',
    sharedBy: (owner) => `Shared by ${owner}`,
    you: 'You',
    owner: 'Owner',
    ownerCount: (n) => `Owner · ${n}`,
    everyone: 'Everyone',
    filterBy: 'Added by',
    filterHint: (name) => `Show only titles ${name === 'You' ? 'you' : name} added`,
    addTitle: 'Add a title',
    add: 'Add',
    addPerson: 'Add a person',
    added: (n) => `${titles(n)} added`,
    addedAgo: (byline, ago) => (ago ? `${byline} · ${ago}` : byline),
    peopleButton: (n) => `${n} ${n === 1 ? 'person' : 'people'} on this list`,
    searchOpen: 'Search this list',
    searchClose: 'Close search',
    noneByPerson: (name) => `${name === 'You' ? 'You haven’t' : `${name} hasn’t`} added anything yet.`,
  },

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
    // The list-led landing (B3, B4, B7), once the list has titles.
    invitedToJoin: (owner) => `${owner} invited you to join`,
    // "Mia, Sam and Priya · 12 titles". More than shown: "and 3 more".
    members: (names, more, n) => `${joinNames(more > 0 ? [...names, `${more} more`] : names)} · ${titles(n)}`,
    listBody: 'Add what you want to watch and see what everyone else added. It’s free.',
    whereNote: (owner) => `You’ll find it under Shared in My Lists. Joining doesn’t follow ${owner}.`,
  },

  errors: {
    premium_required: 'This list isn’t taking new people right now.',
    not_allowed: 'This invite doesn’t work for your account.',
  },
});
