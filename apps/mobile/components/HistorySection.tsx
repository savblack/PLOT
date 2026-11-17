/**
 * Watch history, grouped into one collapsible section per month, newest first.
 *
 * Mobile rendered history as a flat reverse-chronological list on its own
 * screen. Web has never done that: it groups by month inside My Lists, skipping
 * months with nothing in them, and gives each group the same CollapsibleSection
 * treatment as every other list. This is that, ported.
 *
 * Grouping comes from @plot/core/history.js (`groupEntriesByMonth`,
 * `monthLabel`), so the two platforms agree on what a month contains and how it
 * is labelled.
 */
import { useEffect, useMemo, useState } from 'react';
import { View, StyleSheet } from 'react-native';
import Chip from './Chip';
import CollapsibleSection from './CollapsibleSection';
import HistoryInsights from './HistoryInsights';
import HistoryRow from './HistoryRow';
import { HistoryEntry } from '../hooks/useHistory';
import { useTheme } from '../contexts/ThemeContext';
import { Palette, spacing } from '../lib/tokens';
import { monthLabel } from '@plot/core/history.js';
import { useGenres } from '@plot/core/useGenres.js';
import { DRILLDOWN_STATS, type Drilldown } from '@plot/core/historyDrilldown.js';
import { HISTORY_VIEW as T } from '@plot/core/copy/historyView.js';
import EmptyState from './EmptyState';
import ComparePrompt from './taste/ComparePrompt';

export interface MonthGroup {
  key: string;
  year: number;
  month: number;
  entries: HistoryEntry[];
}

/**
 * Month groups appear and disappear as entries change, so they can't be driven
 * by the screen's static `sectionsOpen` map the way the fixed sections are.
 * Each group owns its state and re-syncs when the bulk control fires — the
 * signal carries a token so re-applying the same value still registers.
 * Mirrors web's useSignalledOpen.
 */
function useSignalledOpen(signal: { token: number; open: boolean } | null, initial: boolean) {
  const [open, setOpen] = useState(initial);
  useEffect(() => {
    if (signal) setOpen(signal.open);
  }, [signal?.token]); // eslint-disable-line react-hooks/exhaustive-deps
  return [open, setOpen] as const;
}

function HistoryMonthGroup({
  group, expandSignal,
}: {
  group: MonthGroup;
  expandSignal: { token: number; open: boolean } | null;
}) {
  const [open, setOpen] = useSignalledOpen(expandSignal, true);
  return (
    <CollapsibleSection
      id={`history-${group.year}-${group.month}`}
      label={monthLabel(group.year, group.month)}
      count={group.entries.length}
      open={open}
      onOpenChange={setOpen}
    >
      {group.entries.map(entry => (
        <HistoryRow key={entry.id} entry={entry} />
      ))}
    </CollapsibleSection>
  );
}

export default function HistorySection({
  groups, hasAnyEntries, expandSignal, sharePreset = null, onSharePresetUsed,
  drilldown = null, onDrilldown, onClearDrilldown, onUpgrade,
}: {
  groups: MonthGroup[];
  hasAnyEntries: boolean;
  expandSignal: { token: number; open: boolean } | null;
  /** Card id from `?share=`, when a link opened this screen on a card. */
  sharePreset?: string | null;
  onSharePresetUsed?: () => void;
  /** Premium only. The filter a stat row set, the setter for one, and its remover. */
  drilldown?: Drilldown | null;
  onDrilldown?: (d: Drilldown) => void;
  onClearDrilldown?: () => void;
  onUpgrade?: () => void;
}) {
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const { genres } = useGenres();
  const drillLabel = !drilldown ? null
    : drilldown.stat === DRILLDOWN_STATS.GENRE
      ? T.drilldownGenre(genres.find((g: { id: number; name: string }) => g.id === drilldown.genre)?.name ?? '')
      : drilldown.stat === DRILLDOWN_STATS.WEEKDAY
        ? T.drilldownWeekday(['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'][drilldown.weekday ?? 0])
        : T.drilldownTitles(drilldown.year);

  // Two different empties, as on web: nothing ever watched reads differently
  // from "your filters excluded everything".
  if (!hasAnyEntries) {
    return (
      <EmptyState title={T.emptyTitle} body={T.emptyBody} />
    );
  }

  return (
    <View>
      <HistoryInsights sharePreset={sharePreset} onSharePresetUsed={onSharePresetUsed} onDrilldown={onDrilldown} onUpgrade={onUpgrade} />
      <ComparePrompt />
      {drilldown && drillLabel && (
        <Chip selected label={`${drillLabel}  ×`} accessibilityLabel={T.drilldownRemove(drillLabel)} onPress={() => onClearDrilldown?.()} style={styles.chip} />
      )}
      {groups.length === 0 ? (
        <EmptyState title={T.noMatchesTitle} body={T.noMatchesBody} />
      ) : groups.map(g => (
        <HistoryMonthGroup key={g.key} group={g} expandSignal={expandSignal} />
      ))}
    </View>
  );
}

// Takes the palette like every other makeStyles, though nothing here is colored now.
const makeStyles = (_colors: Palette) => StyleSheet.create({
  chip: {
    alignSelf: 'flex-start',
    marginHorizontal: spacing.xl,
    marginBottom: spacing.md,
  },
});
