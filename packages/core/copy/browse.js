export const BROWSE = {
  // Shell header for /browse (navigation.js VIEW_TITLES). The page's own h1 names the keyword.
  pageTitle: 'Browse',
  keywordsLabel: 'Keywords',
  moreKeywords: (n) => `+${n} more`,
  fewerKeywords: 'Show fewer',
  genreLink: (name) => `Browse ${name}`,
  keywordLink: (name) => `Browse ${name}`,
  keywordTitle: (name) => name,
  keywordEyebrow: 'Keyword',
  empty: 'Nothing found for this keyword yet.',
  loadError: 'We couldn’t load these titles',
  retry: 'Try again',
  back: 'Back',
};
