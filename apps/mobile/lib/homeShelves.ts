// Display names for the Home shelves the Customize Home screen lists. The ids
// are @plot/core/homeLayout.js HOME_SECTION_IDS; the names match the section
// headers Home draws (and web's Jump to card).
import { PEOPLE } from '@plot/core/copy/people.js';
import { DISCOVER_VIEW } from '@plot/core/copy/discoverView.js';

export const HOME_SHELF_LABELS: Record<string, string> = {
  picks: DISCOVER_VIEW.picks.cardsLabel,
  // Mobile draws this slot as Up next (Continue watching plus the saved
  // titles, see Home); web still draws Continue watching there.
  continue: DISCOVER_VIEW.upNext,
  because: DISCOVER_VIEW.recommendations.becauseName,
  forYou: DISCOVER_VIEW.recommendations.forYouTitle,
  hot: 'Hot Right Now',
  weekly: 'Top 20 This Week',
  people: PEOPLE.shelf.title,
  streaming: DISCOVER_VIEW.nowOnStreamingTitle,
  anticipated: DISCOVER_VIEW.mostAnticipatedTitle,
  // Same words as the section header Home draws (index.tsx).
  platforms: 'Top 10 by Platform',
};
