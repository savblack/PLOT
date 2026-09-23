// Shared copy: post-save watch prompt (PLO-473) and post–mark-watched rate
// prompt (PLO-474). Both platforms render the same chrome on MediaPanel.

export const ENGAGEMENT_PROMPT = {
  // Watch hop — short, factual, Letterboxd-style habit (not guilt).
  watchedIt: 'Watched it?',
  markAsWatched: 'Mark as watched',
  imWatching: "I'm watching",
  notYet: 'Not yet',
  // Rate hop — same one-line chrome. The written-review CTA reuses
  // MEDIA_PANEL.writeReview so the catalog does not own that string twice.
  howWasIt: 'How was it?',
  skipForNow: 'Skip for now',
};
