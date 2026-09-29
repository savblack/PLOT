import { useMemo, useState } from 'react';
import { useHistory } from './useHistory.js';
import { useHistoryDetails } from './useHistoryDetails.js';
import { useTopLists } from './useTopLists.js';
import { useGenres } from './useGenres.js';
import { entriesInYear } from './historyStats.js';
import { buildShareCards } from './shareCards.js';

/**
 * The share cards for the signed-in user, from wherever the sheet opens.
 * History already has entries and details in hand and builds its cards
 * itself; every other surface (the profile's Share menu, a notification's
 * deep link) uses this so it does not have to know what a card needs.
 *
 * Loads nothing until `enabled`, so a page can mount it and pay only when
 * the sheet is actually opened. The year is the current one: the profile
 * has no year switcher, and "Your 2026 so far" is the card people post.
 *
 * @param {{ userId?: string|null, profile?: object|null, enabled?: boolean, now?: Date }} a
 * @returns {{ cards: object[], loading: boolean }}
 */
export function useShareCards({ userId, profile, enabled = true, now } = {}) {
  // One clock per mount, so the memo below does not churn on a fresh Date.
  const [today] = useState(() => now ?? new Date());
  const active = enabled && !!userId;
  const { entries, loading: historyLoading } = useHistory(active ? userId : null);
  const { lists: topLists, loading: listsLoading } = useTopLists(active ? userId : null);
  const { genres } = useGenres();
  const year = today.getFullYear();
  const yearEntries = useMemo(() => entriesInYear(entries, year), [entries, year]);
  const { details } = useHistoryDetails(yearEntries, { enabled: active });
  const cards = useMemo(() => {
    if (!active || !profile) return [];
    const genreName = (id) => genres.find(g => g.id === id)?.name ?? null;
    return buildShareCards({ entries: yearEntries, details, genreName, year, now: today, topLists, profile });
  }, [active, profile, yearEntries, details, genres, year, today, topLists]);
  return { cards, loading: active && (historyLoading || listsLoading) };
}
