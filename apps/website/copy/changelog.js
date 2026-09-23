// Reference-only copy catalog for apps/website/changelog.html. Not imported by
// the HTML — see copy/common.js for how this catalog is used.

export const CHANGELOG_PAGE = {
  meta: {
    title: 'Changelog — plot',
    description: 'What is new, improved, and fixed in plot. Dated release notes for the movie and TV companion.',
  },
  pageLabel: 'Product',
  h1: 'Changelog',
  pageMeta: 'What shipped in plot, newest first.',
  intro:
    'Every public ship lands here the same day, in plain language. Entries use New, Improved, and Fixed.',
  buckets: {
    new: 'New',
    improved: 'Improved',
    fixed: 'Fixed',
  },
  // Keep newest-first. Mirror the live entries in changelog.html when you ship.
  entries: [
    {
      version: '2026.9.21',
      date: '2026-09-21',
      dateLabel: '21 September 2026',
      new: [
        'A public changelog at theplot.tv/changelog, so you can see what shipped without digging store notes',
        'A collapsible navigation rail on web that gives the page you are on more room',
        'A redesigned New Releases page with clearer browsing and filters',
        'A refreshed notifications layout that is easier to scan',
      ],
      improved: [
        'Mobile navigation and sheets feel tighter and more consistent across the app',
        'List controls and recovery when something goes wrong mid-edit',
        'More film and TV title pages for search and sharing',
        'Saving an article from What\'s On hands off more cleanly into the app',
      ],
      fixed: [
        'Poster quick actions on lists working again',
        'Genre filtering on New Releases completing as expected',
        'Favourites shelf staying compact on profiles',
        'Navigation rail and title panel polish that left controls misaligned',
      ],
    },
  ],
};
