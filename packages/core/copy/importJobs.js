// Background imports: the onboarding step that starts one, the Home card that
// follows it, and the review hand-off on the import page. Shared by web
// (src/copy/importJobs.js re-exports it) and mobile.

const plural = (n, one, many) => `${Number(n).toLocaleString()} ${n === 1 ? one : many}`;

export const IMPORT_JOBS = {
  // ── Onboarding: a source is picked ──
  onboarding: {
    chooseFile: 'Choose your export file',
    chooseFileHint: (formats) => `${formats} from your export. We’ll match every title in the background while you finish setting up.`,
    dropHere: 'Drop your file here, or browse',
    uploading: 'Uploading…',
    // The upload landed and the job is queued. Setup carries on.
    queued: (source) => `Got it. Your ${source} history is importing in the background.`,
    queuedBody: 'Keep going. We’ll show the progress on Home and let you know when it’s done.',
    connect: (source) => `Connect ${source}`,
    connecting: 'Waiting for you to finish in the other window…',
    connected: (source) => `${source} is connected.`,
    startImport: 'Import my history',
    startPlexImport: 'Import from this profile',
    starting: 'Starting…',
    connectedAs: (name) => `as ${name}`,
    plexServer: 'Server',
    plexProfile: 'Profile',
    plexOwned: 'Owned',
    plexShared: 'Shared with you',
    plexSelected: (server, profile) => `Only what ${profile} has watched on ${server} comes across. Change it any time in Settings.`,
    plexServerLater: 'Plex needs a server and profile picked in Settings before the import can run. We’ll remind you on Home.',
    // The only server and profile were picked for them (or they picked).
    plexPicked: (server, profile) => [server, profile].filter(Boolean).join(' · '),
    uploadFailed: 'We couldn’t upload that file. Check your connection and try again.',
    alreadyRunning: 'An import is already running. You can follow it on Home.',
    // A second pick while one runs: the worker takes them one at a time.
    queuedBehind: (source, running) => `Got it. Your ${source} history is queued and starts when ${running} finishes.`,
    addAnother: 'Add another source',
    queueFull: 'That’s plenty queued for now. Let these finish, then add more from Settings.',
    continue: 'Continue →',
  },

  // ── The building moment: its first line while an import runs ──
  building: { matching: (source) => `Matching your ${source} history…` },

  // ── Home card ──
  card: {
    title: (source) => `Importing from ${source}`,
    doneTitle: (source) => `Your ${source} history is in`,
    failedTitle: (source) => `Your ${source} import stopped`,
    cancelledTitle: (source) => `${source} import cancelled`,
    queued: 'Starting…',
    queuedBehind: (running) => `Starts after ${running}`,
    thenNext: (next) => `then ${next}`,
    parsing: 'Reading your file…',
    matching: (done, total) => (total ? `Matching ${done.toLocaleString()} of ${total.toLocaleString()} titles` : 'Matching titles…'),
    writing: 'Saving to your history…',
    connecting: (source) => `Pulling your history from ${source}…`,
    retrying: 'Hit a snag. Trying again shortly…',
    // Done.
    summary: (imported, duplicates) => `${plural(imported, 'title', 'titles')} added${duplicates ? `, ${plural(duplicates, 'duplicate', 'duplicates')} skipped` : ''}.`,
    review: (n) => `${plural(n, 'title needs', 'titles need')} a match from you.`,
    failedRows: (n) => `${plural(n, 'entry', 'entries')} couldn’t be saved. Nothing already in Plot was changed.`,
    reviewCta: 'Finish matching',
    historyCta: 'View history',
    retryCta: 'Try again',
    cancel: 'Cancel import',
    dismiss: 'Dismiss',
    progressLabel: 'Import progress',
  },

  // ── Import page: finishing a job's leftovers ──
  review: {
    title: (source) => `Finish your ${source} import`,
    body: (n) => `${plural(n, 'title', 'titles')} couldn’t be matched automatically. Choose the right title for each, or leave it out.`,
    missing: 'We couldn’t find anything left to review for this import.',
  },

  // Worker-side failure messages. The row's last_error is shown on the card.
  errors: {
    noEntries: 'No watch history was found in this file. Check you exported from the right source.',
    unreadable: 'We couldn’t read this file. Make sure it’s the unmodified export.',
    connectionMissing: (source) => `${source} isn’t connected any more. Reconnect it in Settings and try again.`,
    plexSelection: 'Pick a Plex server and profile in Settings, then try again.',
    historyRead: 'We couldn’t check what’s already in your history, so the import stopped. Nothing was changed.',
    gaveUp: 'The import kept failing. Nothing already in Plot was changed. Try the file again from the import page.',
  },
};
