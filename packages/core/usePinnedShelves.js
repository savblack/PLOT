/* The pinned shelves Home should draw, in pin order. Premium only: a Free or
 * lapsed viewer gets none, but their saved pins are untouched (homeLayout.js).
 * Shared by web and mobile; each app draws the shelves its own way.
 */
import { useMemo } from 'react';
import { visibleHomePins } from './homeLayout.js';
import { pinExists, pinLabel, pinnedPersonItems, pinnedTitles } from './homePins.js';
import { usePeopleFeed, usePeopleFollows } from './usePeopleFollows.js';

/**
 * @param {{
 *   userId?: string | null,
 *   layout: import('./homeLayout.js').HomeLayout,
 *   premium: boolean,
 *   watchlistItems: any[],
 *   watchingItems: any[],
 *   lists: any[],
 *   region: string,
 *   today: string,
 * }} args
 * @returns {{
 *   shelves: { key: string, pin: { kind: string, id: string }, label: string, kind: string, titles: any[], people: any[] }[],
 *   follows: any[],
 * }} titles: Want to Watch and list shelves; people: feed items for a person shelf
 */
export function usePinnedShelves({ userId, layout, premium, watchlistItems, watchingItems, lists, region, today }) {
  // Follows are a Premium feature everywhere else too; do not read them for Free.
  const people = usePeopleFollows(premium ? userId : null);
  const follows = people.follows;

  const pins = useMemo(
    () => visibleHomePins(layout, { premium, exists: (pin) => pinExists(pin, { lists, follows }) }),
    [layout, premium, lists, follows],
  );
  const personIds = useMemo(() => pins.filter(p => p.kind === 'person').map(p => Number(p.id)), [pins]);
  const { rows } = usePeopleFeed(personIds, { today, version: people.feedVersion });

  const shelves = useMemo(() => pins.map(pin => ({
    key: `${pin.kind}:${pin.id}`,
    pin,
    kind: pin.kind,
    label: pinLabel(pin, { lists, follows }) ?? '',
    titles: pin.kind === 'person' ? [] : pinnedTitles(pin, { watchlistItems, watchingItems, lists, today }),
    people: pin.kind === 'person' ? pinnedPersonItems(rows, pin.id, { region, today }) : [],
  })), [pins, lists, follows, watchlistItems, watchingItems, rows, region, today]);

  return { shelves, follows };
}
