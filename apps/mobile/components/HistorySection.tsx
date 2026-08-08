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
import { View, Text, StyleSheet } from 'react-native';
import CollapsibleSection from './CollapsibleSection';
import HistoryRow from './HistoryRow';
import { HistoryEntry } from '../hooks/useHistory';
import { useTheme } from '../contexts/ThemeContext';
import { Palette, fontFamily, fontSize, spacing } from '../lib/tokens';
import { monthLabel } from '@plot/core/history.js';

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
  groups, hasAnyEntries, expandSignal,
}: {
  groups: MonthGroup[];
  hasAnyEntries: boolean;
  expandSignal: { token: number; open: boolean } | null;
}) {
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);

  // Two different empties, as on web: nothing ever watched reads differently
  // from "your filters excluded everything".
  if (!hasAnyEntries) {
    return (
      <View style={styles.empty}>
        <Text style={styles.emptyTitle}>Nothing watched yet</Text>
        <Text style={styles.emptyBody}>
          Your watch history will appear here. Search for a title and mark it as watched to get started.
        </Text>
      </View>
    );
  }

  if (groups.length === 0) {
    return (
      <View style={styles.empty}>
        <Text style={styles.emptyTitle}>No matches</Text>
        <Text style={styles.emptyBody}>No history matches the current filters.</Text>
      </View>
    );
  }

  return (
    <View>
      {groups.map(g => (
        <HistoryMonthGroup key={g.key} group={g} expandSignal={expandSignal} />
      ))}
    </View>
  );
}

const makeStyles = (colors: Palette) => StyleSheet.create({
  empty: { paddingVertical: spacing.xl * 2, paddingHorizontal: spacing.xl, alignItems: 'center' },
  emptyTitle: { fontFamily: fontFamily.serif, fontSize: fontSize.lg, color: colors.textPrimary, marginBottom: spacing.sm },
  emptyBody: { fontFamily: fontFamily.sans, fontSize: fontSize.sm, color: colors.textMuted, textAlign: 'center', lineHeight: 20 },
});
