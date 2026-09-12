// Shared copy: report and block, used by the web app and mobile.
// Lives in @plot/core/copy so the two platforms can't drift word by word;
// apps/web/src/copy/moderation.js re-exports it so src/copy stays the single
// place the web app and the Storybook Content page look for copy.
//
// REASONS mirrors App Store Guideline 1.1's categories, and its ids are the
// exact values the reports.reason check constraint accepts. Changing an id here
// without a migration silently breaks every submission.

export const MODERATION = {
  // ── Report ──
  reportAction: 'Report',
  reportTitle: 'Report this account',
  reportLead: 'Tell us what is wrong and we will review it. Reports are private.',
  reasonLabel: 'What is the problem?',
  detailLabel: 'Anything else? (optional)',
  detailPlaceholder: 'Add any detail that would help us review this.',
  detailTooLong: 'Please keep this under 2000 characters.',
  chooseReason: 'Choose a reason to continue.',
  submitReport: 'Submit report',
  submitting: 'Submitting',
  reportFailed: 'We could not send that report. Please try again.',
  // The acknowledgement Guideline 1.2 asks for: "timely responses to concerns"
  // starts with telling the reporter it arrived.
  reportSentTitle: 'Report received',
  reportSentBody: 'Thanks. We review reports within 24 hours.',
  alsoBlock: 'Also block this account',
  alsoBlockHint: 'They will not be able to see you or your activity.',

  // ── Block ──
  blockAction: 'Block',
  unblockAction: 'Unblock',
  blockTitle: (name) => `Block ${name}?`,
  blockBody: 'You will not see each other, and any follows between you will be removed. You can undo this in Settings.',
  blockConfirm: 'Block',
  blockFailed: 'We could not block that account. Please try again.',
  unblockFailed: 'We could not unblock that account. Please try again.',
  blockedBadge: 'Blocked',

  // ── Settings ──
  blockedTitle: 'Blocked accounts',
  blockedEmpty: 'You have not blocked anyone.',
  blockedCount: (n) => (n === 1 ? '1 blocked account' : `${n} blocked accounts`),

  // ── Reason picker ──
  // ids match the DB check constraint: harassment, hate, sexual,
  // impersonation, spam, other.
  REASONS: [
    { id: 'harassment',    label: 'Harassment or bullying' },
    { id: 'hate',          label: 'Hate or discrimination' },
    { id: 'sexual',        label: 'Sexual content' },
    { id: 'impersonation', label: 'Impersonation' },
    { id: 'spam',          label: 'Spam' },
    { id: 'other',         label: 'Something else' },
  ],
};
