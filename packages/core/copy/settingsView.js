// Shared copy: used by the web app and mobile's app/(app)/settings.tsx.
// Lives in @plot/core/copy so the two platforms can't drift word by word;
// apps/web/src/copy/settingsView.js re-exports it so src/copy stays the single place
// the web app and the Storybook Content page look for copy.

export const SETTINGS_VIEW = {
  region: {
    savingRegion: 'Saving region',
    saveRegion: 'Save region',
    saveRegionLabel: 'Save Region',
    openRegionSettings: 'Open region settings',
    failedToSaveRegion: 'Failed to save your region.',
  },
  timezone: {
    savingTimezone: 'Saving timezone',
    saveTimezone: 'Save timezone',
    openTimezoneSettings: 'Open timezone settings',
  },
  clearSelected: (count) => `Clear Selected (${count})`,
  selectListsToClear: 'Select lists to clear',

  avatar: {
    profilePhoto: 'Profile Photo',
    chooseImageFile: 'Please choose an image file.',
    tooLarge: (maxMb) => `Profile photos must be under ${maxMb}MB.`,
    uploadFailed: 'We could not upload your photo. Please try again.',
    saveFailed: 'We could not save your photo. Please try again.',
    removeFailed: 'We could not remove your photo. Please try again.',
    savePhoto: 'Save photo',
    shownOnProfile: 'Shown on your public profile',
    sizeHint: (maxMb) => `JPG or PNG · up to ${maxMb}MB`,
    change: 'Change',
    addPhoto: 'Add photo',
  },

  feedback: {
    bugReportLabel: 'Bug report',
    bugReportDescription: 'Something broke, behaved oddly, or felt unreliable.',
    featureRequestLabel: 'Feature request',
    featureRequestDescription: 'An idea that would make PLOT more useful or more delightful.',
    generalFeedbackLabel: 'General feedback',
    generalFeedbackDescription: 'Anything else about the experience, product, or taste of the app.',
    notSaved: 'Your feedback was not saved. Please try again.',
    reportABug: 'Report a bug',
    leaveFeedback: 'Leave feedback',
  },

  errors: {
    failedToSaveStreamingPlatforms: 'Failed to save your streaming platforms.',
    failedToSaveChannels: 'Failed to save your channels.',
    failedToSaveGenres: 'Failed to save your genres.',
    failedToUpdateAvailabilityAlerts: 'Failed to update availability alerts.',
    failedToUpdateMarketingEmails: 'Failed to update your email preference.',
    failedToClearWatchHistory: 'Failed to clear watch history.',
    failedToClearLists: 'Failed to clear your lists.',
    failedToDeleteCustomList: 'Failed to delete a custom list.',
    failedToExportData: 'Failed to export your data.',
    couldNotUpdateName: 'Could not update name. Try again.',
    enterAName: 'Enter a name.',
    enterAValidEmail: 'Enter a valid email address.',
    emailAlreadyInUse: 'That email is already in use.',
    couldNotUpdateEmail: 'Could not update email. Try again.',
    couldNotSendTestEmail: 'Could not send a test email. Try again.',
  },

  confirm: {
    clearWatchHistoryTitle: 'Clear watch history?',
    clearWatchHistoryMessage: 'This will permanently delete all your watched entries. This cannot be undone.',
    clearHistory: 'Clear history',
    deleteAccountTitle: 'Delete account?',
    deleteAccountMessage: 'This will permanently delete your account and all your data. This cannot be undone.',
    deleteAccount: 'Delete account',
    deleteAccountPhrase: 'delete account',
    revokeCalendarLinkTitle: 'Revoke calendar link?',
    revokeCalendarLinkMessage: 'Your calendar app will stop receiving updates. You can generate a new link at any time.',
    revoke: 'Revoke',
  },

  shareTaglines: [
    'This is where my evenings and weekends go.',
    'Everything I love to watch, in one place.',
    'A curated view of my screen time.',
    "Keep up with what I'm watching, on PLOT.",
  ],
  shareTitleWithUsername: (username) => `@${username} on PLOT`,
  shareTitleDefault: 'My profile',
  shareJoinMe: 'Join me on PLOT',
  inviteText: "Join me on PLOT. Here's what I'm watching.",

  addYourName: 'Add your name',
  signOut: 'Sign out',
  makePrivate: 'Make private',
  makePublic: 'Make public',

  username: {
    checkingAvailability: 'Checking availability…',
    available: 'Available',
    taken: 'That username is taken',
    formatHint: '3–30 chars · lowercase letters, numbers, hyphens',
    saved: 'Saved',
    error: 'Something went wrong. Try again',
  },

  invite: 'Invite',

  integrations: {
    groupTitle: 'Integrations',
    openStreamingPlatforms: 'Open streaming platforms',
    streamingPlatformsLabel: 'Streaming platforms',
    openMyChannels: 'Open my channels',
    myChannelsLabel: 'Channels',
    openGenres: 'Open genres',
    genresLabel: 'Genres',
    selectedCount: (n) => `${n} selected`,
    plexName: 'Plex',
    plexBlurb: 'Sync your Plex watchlist and history',
    traktName: 'Trakt',
    traktBlurb: 'Sync Netflix, Prime, Disney+ & more',
    pausedNeedsPremium: 'Paused, needs PLOT Premium to sync',
    requestedAccessMessage: (name) => `Requested access: ${name} sync`,
    requested: 'Requested ✓',
    requestAccess: 'Request access',
    disconnect: 'Disconnect',
    connectedLastSynced: (date) => `Connected · Last synced ${date}`,
    never: 'never',
    notConnected: 'Not connected',
    connectPlex: 'Connect Plex',
    connectTraktToSync: 'Connect to sync Netflix, Prime, Disney+ & more',
    connectTrakt: 'Connect Trakt',
    syncNow: 'Sync now',
    importWatchHistory: 'Import watch history',
    importWatchHistoryLabel: 'Import Watch History',
    importWatchHistoryHint: 'Import from Netflix, Prime, Disney+, Max or Apple TV+',
  },


  kidsContent: {
    label: 'Kids content',
    onHint: 'Show movies and shows made for kids in Discover and recommendations.',
    offHint: 'Kids and family content is hidden from Discover and recommendations.',
  },

  availabilityAlerts: {
    label: 'Watchlist availability alerts',
    sentNotice: 'Sent. Check your inbox.',
    idleHint: "Email me when a saved title arrives on a streaming platform or channel I've selected",
    sendTest: 'Send test',
  },

  // Deliberately makes no promise about frequency — the digest is sent by hand,
  // so a stated cadence would be a promise nothing keeps.
  marketingEmails: {
    label: 'Email digest',
    onHint: "You'll get the PLOT digest by email. Unsubscribe any time.",
    offHint: 'The chart, what to watch this weekend, and what just landed on streaming.',
  },

  premium: {
    groupTitle: 'PLOT Premium',
    youHavePremium: 'You have PLOT Premium',
    thankYou: 'Thank you for keeping PLOT running',
    opening: 'Opening…',
    manageSubscription: 'Manage subscription',
    thanksForTip: 'Thanks for supporting PLOT ♥',
    activeThankYou: 'PLOT Premium is active. Thank you ♥',
    upsellLabel: 'Go Premium',
    upsellBlurb: 'Unlimited custom lists and a live calendar feed.',
    upgradeButton: 'Upgrade',
  },

  calendarFeed: {
    groupTitle: 'Calendar',
    subscribeLabel: 'Subscribe to Calendar',
    needsPremium: 'A live calendar feed needs PLOT Premium',
    liveFeedPrivate: 'Live feed of your watchlist',
    getUrlHint: 'Get a URL for Google or Apple Calendar',
    requestedCalendarSubscribeMessage: 'Requested access: Calendar subscribe',
    copyLink: 'Copy link',
    generating: 'Generating…',
    generateLink: 'Generate link',
    exportLabel: 'Export to Calendar',
    loadingEvents: 'Loading events…',
    eventCount: (n) => `${n} event${n !== 1 ? 's' : ''} · one-time snapshot`,
    downloadIcs: 'Download .ics',
  },

  export: {
    label: 'Export Your Data',
    hint: 'Watchlist, history, lists and more as JSON or CSV',
    preparing: 'Preparing…',
    downloadJson: 'Download .json',
    downloadCsv: 'Download .csv',
  },

  support: {
    groupTitle: 'Support',
    supportPlot: 'Support PLOT',
    kofiHint: 'Help keep PLOT ',
    kofiHintContinued: 'subscription-free',
    reportABugAria: 'Report a bug',
    reportABugLabel: 'Report a Bug',
    leaveFeedbackAria: 'Leave feedback',
    leaveFeedbackLabel: 'Leave Feedback',
  },

  // Data-source attribution. TMDB's API terms require the notice below verbatim
  // and ask for it on an About or Credits style surface rather than buried in
  // legal pages, which is why this is its own settings group and not a line in
  // the Terms page. TVMaze and OMDb ask for credit too, so they sit here with it.
  credits: {
    groupTitle: 'Credits',
    intro: 'PLOT is built on data from these sources.',
    tmdbName: 'TMDB',
    tmdbNotice: 'This product uses the TMDB API but is not endorsed or certified by TMDB.',
    tvmazeName: 'TVmaze',
    tvmazeNotice: 'Episode air dates and the TV guide use the TVmaze API.',
    omdbName: 'OMDb',
    omdbNotice: 'Critic scores are retrieved through the OMDb API.',
  },

  dangerZone: {
    groupTitle: 'Danger Zone',
    clearListsAria: 'Clear lists',
    clearListsLabel: 'Clear Lists',
    clearWatchHistoryAria: 'Clear watch history',
    clearWatchHistoryLabel: 'Clear Watch History',
    deleteAccountAria: 'Delete account',
    // Same string as deleteAccountAria above; kept as separate keys because the
    // visible label and the aria label are free to diverge.
    deleteAccountLabel: 'Delete account',
  },

  myPlatforms: 'Streaming platforms',
  clearing: 'Clearing…',
  verifyEmail: {
    sent: 'Sent',
    tryAgain: 'Try again',
    verifyNow: 'Verify now',
  },
  genres: {
    loadError: "We couldn't load the genre list.",
    tryAgain: 'Try again',
  },
};
