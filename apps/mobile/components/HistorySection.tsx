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
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { useRouter, type Href } from 'expo-router';
import CollapsibleSection from './CollapsibleSection';
import HistoryInsights from './HistoryInsights';
import HistoryRow from './HistoryRow';
import { HistoryEntry } from '../hooks/useHistory';
import { useTheme } from '../contexts/ThemeContext';
import { Palette, fontFamily, fontSize, spacing, radii } from '../lib/tokens';
import { monthLabel } from '@plot/core/history.js';
import { TASTE_OVERLAP } from '@plot/core/copy/tasteOverlap.js';

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
}: {
  groups: MonthGroup[];
  hasAnyEntries: boolean;
  expandSignal: { token: number; open: boolean } | null;
  /** Card id from `?share=`, when a link opened this screen on a card. */
  sharePreset?: string | null;
  onSharePresetUsed?: () => void;
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

  return (
    <View>
      <HistoryInsights sharePreset={sharePreset} onSharePresetUsed={onSharePresetUsed} />
      <HistoryComparePrompt />
      {groups.length === 0 ? (
        <View style={styles.empty}>
          <Text style={styles.emptyTitle}>No matches</Text>
          <Text style={styles.emptyBody}>No history matches the current filters.</Text>
        </View>
      ) : groups.map(g => (
        <HistoryMonthGroup key={g.key} group={g} expandSignal={expandSignal} />
      ))}
    </View>
  );
}

function HistoryComparePrompt() {
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const router = useRouter();
  return (
    <View style={styles.prompt}>
      <Text style={styles.promptTitle}>{TASTE_OVERLAP.historyPromptTitle}</Text>
      <Text style={styles.promptBody}>{TASTE_OVERLAP.historyPromptBody}</Text>
      <TouchableOpacity
        style={styles.promptBtn}
        accessibilityRole="button"
        onPress={() => router.push('/(app)/compare' as Href)}
      >
        <Text style={styles.promptBtnText}>{TASTE_OVERLAP.compareTaste}</Text>
      </TouchableOpacity>
    </View>
  );
}

const makeStyles = (colors: Palette) => StyleSheet.create({
  empty: { paddingVertical: spacing.xl * 2, paddingHorizontal: spacing.xl, alignItems: 'center' },
  emptyTitle: { fontFamily: fontFamily.displaySemi, fontSize: fontSize.lg, color: colors.textPrimary, marginBottom: spacing.sm },
  emptyBody: { fontFamily: fontFamily.sans, fontSize: fontSize.sm, color: colors.textMuted, textAlign: 'center', lineHeight: 20 },
  prompt: {
    marginHorizontal: spacing.xl,
    marginTop: spacing.md,
    marginBottom: spacing.lg,
    padding: spacing.lg,
    borderRadius: radii.lg,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    gap: spacing.sm,
  },
  promptTitle: { fontFamily: fontFamily.sansBold, fontSize: fontSize.sm, color: colors.textSecondary },
  promptBody: { fontFamily: fontFamily.sans, fontSize: fontSize.sm, lineHeight: 20, color: colors.textMuted },
  promptBtn: {
    alignSelf: 'flex-start',
    minHeight: 36,
    justifyContent: 'center',
    paddingHorizontal: spacing.lg,
    borderRadius: radii.pill,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.textPrimary,
  },
  promptBtnText: { fontFamily: fontFamily.sansBold, fontSize: fontSize.sm, color: colors.textPrimary },
});
