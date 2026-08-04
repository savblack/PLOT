// No cadence claimed anywhere here on purpose: the digest is sent by hand
// (marketing/newsletter/send-digest.mjs has no cron), so "one email a week" is a
// promise nothing keeps. Say what is in it, not how often it arrives.
export const DIGEST_NUDGE = {
  title: 'Want to stay in the know?',
  body: 'The latest movie and TV news, straight to your inbox: what just landed, what is worth watching, and what is coming next.',
  confirmedTitle: "You're in",
  confirmedBody: "We'll email you the next issue. You can turn it off in Settings whenever you like.",
  optIn: 'Keep me in the loop',
  optingIn: 'Signing you up…',
  dismiss: 'Maybe later',
  failed: 'That did not save. Try again.',
};
