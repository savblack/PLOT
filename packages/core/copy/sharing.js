export const SHARING = {
  titleText: (title) => `Thought you might like ${title || 'this title'}. Save it to your watchlist on plot.`,
  listText: (name) => `Something for your next watch: ${name}, a list on plot.`,
  profileText: (name) => `See what ${name} is watching on plot.`,
  failedTitle: 'Could not share',
  failed: 'Please try sharing again.',
  copyManually: 'Copy this link to share it:',
  previewKicker: (source) => (
    ['whats_on_article', 'whats_on_guide', 'chart', 'newsletter'].includes(source)
      ? 'PLOT RECOMMENDS'
      : 'Shared with you on PLOT'
  ),
  signupToSave: 'Create free account to save',
  signInToSave: 'Sign in to save',
  createAccount: 'Create account',
  returningKicker: 'Welcome back',
  returningBenefit: 'Sign in to save this recommendation to your PLOT.',
  savePromptTitle: (title) => `Save ${title || 'this title'} to your PLOT`,
  savePromptBody: 'Add it to your watchlist now, or choose another list.',
  chooseList: 'Choose a list',
  previewBenefit: 'Keep the recommendations worth watching, all in one place.',
  listBenefit: 'Found your next watch? Select a title to save it to your own watchlist.',
  listSignup: 'Create your free watchlist',
};
