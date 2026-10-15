// Display names for the Home shelves the Customize Home screen lists. The ids
// are @plot/core/homeLayout.js HOME_SECTION_IDS; the names match the section
// headers Home draws (and web's Jump to card). Mobile does not render the
// cinema or anticipated shelves, but a layout is shared with web, so they are
// still listed and reorderable here.
import { PEOPLE } from '@plot/core/copy/people.js';
import { DISCOVER_VIEW } from '@plot/core/copy/discoverView.js';

export const HOME_SHELF_LABELS: Record<string, string> = {
  picks: DISCOVER_VIEW.picks.cardsLabel,
  // Mobile draws this slot as Up next (Continue watching plus the saved
  // titles, see Home); web still draws Continue watching there.
  continue: DISCOVER_VIEW.upNext,
  hot: 'Hot Right Now',
  weekly: 'Top 20 This Week',
  people: PEOPLE.shelf.title,
  releases: 'New Releases',
  binged: 'Most Binged Shows',
  cinema: 'Now Showing',
  anticipated: DISCOVER_VIEW.mostAnticipatedTitle,
  platforms: 'Top 10 by Platform',
};
