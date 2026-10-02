import { customListCreationError, isCustomListLimitError } from '@plot/core/customListCreation.js';
// The films of a collection as rows, plus the "Save as list" footer. Used
// inside the collapsible card on a movie and as the body of the collection
// panel opened from search. Mirrors apps/web/src/components/CollectionFilms.jsx.
import { useMemo, useState } from 'react';
import { View, Text, Image, TouchableOpacity, StyleSheet } from 'react-native';
import Svg, { Circle, Path, Polyline } from 'react-native-svg';
import { collectionPartYear, collectionProgress } from '@plot/core/collections.js';
import { findDuplicateCustomList } from '@plot/core/customLists.js';
import { canCreateCustomList } from '@plot/core/premium.js';
import { MEDIA } from '@plot/core/copy/media.js';
import { MEDIA_PANEL } from '@plot/core/copy/mediaPanel.js';
import { posterUrl, Palette, fontFamily, fontSize, spacing, radii } from '../lib/tokens';
import { useTheme } from '../contexts/ThemeContext';
import { useAppData } from '../contexts/AppDataContext';
import { useMediaPanel } from '../contexts/MediaPanelContext';
import { track, EVENTS } from '../lib/analytics';
import UpgradeSheet from './UpgradeSheet';
import { useRouter } from 'expo-router';
import { PREMIUM_SETTINGS_PATH } from '../lib/premium';

type SaveState = { status: 'idle' | 'saving' | 'saved' | 'error'; message: string };

/** Per-part state and header numbers, from the app's own watchlist and history. */
export function useCollectionProgress(parts: any[], currentId: number | null = null) {
  const { watchlist, history } = useAppData();
  return collectionProgress(parts, {
    currentId,
    isWatched: history.isWatched,
    isInWatchlist: watchlist.isInList,
  });
}

type RunItem = { id: number; title?: string; watched?: boolean };

/** One segment per film. Watched segments use the watching colour, the same
 *  progress voice as Up next. `compact` is the bar alone, under a movie's
 *  collection card; the full block names the run and the next unwatched film. */
export function CollectionRun({ items, watched, total, compact = false }: {
  items: RunItem[];
  watched: number;
  total: number;
  compact?: boolean;
}) {
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  if (!total) return null;
  const next = items.find(item => !item.watched);
  return (
    <View
      style={compact ? styles.runCompact : styles.run}
      accessibilityRole="progressbar"
      accessibilityValue={{ min: 0, max: total, now: watched }}
      accessibilityLabel={MEDIA_PANEL.collectionRunCount(watched, total)}
    >
      {!compact && (
        <View style={styles.runHead}>
          <Text style={styles.runTitle}>{MEDIA_PANEL.yourRun}</Text>
          <Text style={styles.runCount}>{MEDIA_PANEL.collectionRunCount(watched, total)}</Text>
        </View>
      )}
      <View style={styles.runBar}>
        {items.map(item => (
          <View key={item.id} style={[styles.runSeg, compact && styles.runSegCompact, item.watched && { backgroundColor: colors.statusWatching }]} />
        ))}
      </View>
      {!compact && (
        <Text style={styles.runNext}>
          {next ? MEDIA_PANEL.collectionNextUp(next.title) : MEDIA_PANEL.collectionAllWatched}
        </Text>
      )}
    </View>
  );
}

export default function CollectionFilms({ stub, parts, items }: { stub: { id: number; name: string }; parts: any[]; items: any[] }) {
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const { user, profile, customLists } = useAppData();
  const { open: openTitle } = useMediaPanel();
  const [saveState, setSaveState] = useState<SaveState>({ status: 'idle', message: '' });
  const [showUpgrade, setShowUpgrade] = useState(false);
  const router = useRouter();
  const existingList = findDuplicateCustomList(customLists?.lists || [], stub.name);

  const saveAsList = async () => {
    if (!user || saveState.status === 'saving') return;
    const lists = customLists?.lists || [];
    if (!existingList && !canCreateCustomList(lists.length, profile)) {
      track(EVENTS.PREMIUM_GATE_HIT, { feature: 'custom_lists' });
      setShowUpgrade(true);
      return;
    }
    setSaveState({ status: 'saving', message: '' });
    let list;
    try {
      list = existingList || await customLists.createList(stub.name);
    } catch (error) {
      if (isCustomListLimitError(error)) { setSaveState({ status: 'idle', message: '' }); setShowUpgrade(true); return; }
      setSaveState({ status: 'error', message: customListCreationError(error, MEDIA_PANEL.couldNotSaveCollection) });
      return;
    }
    if (!list) { setSaveState({ status: 'error', message: MEDIA_PANEL.couldNotSaveCollection }); return; }
    let failed = false;
    for (const part of [...parts].reverse()) {
      const added = await customLists.addItem(list.id, part);
      if (!added) failed = true;
    }
    if (failed) { setSaveState({ status: 'error', message: MEDIA_PANEL.couldNotSaveCollection }); return; }
    track(EVENTS.COLLECTION_SAVED_AS_LIST, { collection_id: stub.id, parts: parts.length, reused_list: !!existingList });
    setSaveState({ status: 'saved', message: MEDIA_PANEL.collectionSaved });
  };

  return (
    <View>
      <UpgradeSheet visible={showUpgrade} reason="lists" onClose={() => setShowUpgrade(false)} onCompare={() => router.push(PREMIUM_SETTINGS_PATH as any)} />
      {items.map((part: any) => {
        const year = collectionPartYear(part);
        const meta = [
          year,
          part.isCurrent ? MEDIA_PANEL.viewing : '',
          part.inWatchlist ? MEDIA_PANEL.inWatchlist : '',
        ].filter(Boolean).join(' · ');
        return (
          <TouchableOpacity
            key={part.id}
            style={[styles.row, part.isCurrent && styles.rowCurrent, part.watched && styles.rowWatched]}
            activeOpacity={part.isCurrent ? 1 : 0.7}
            onPress={() => { if (!part.isCurrent) openTitle(part.id, 'movie'); }}
            accessibilityRole="button"
          >
            <View style={styles.rowPoster}>
              {part.poster_path
                ? <Image source={{ uri: posterUrl(part.poster_path, 'w92') ?? '' }} style={StyleSheet.absoluteFill} />
                : <Text style={styles.rowPosterFallback}>{(part.title || '?').charAt(0)}</Text>}
            </View>
            <View style={styles.rowText}>
              <Text style={styles.rowTitle} numberOfLines={1}>{part.title}</Text>
              {!!meta && <Text style={styles.rowMeta}>{meta}</Text>}
            </View>
            {part.watched && (
              <View accessibilityLabel={MEDIA.watched}>
                <Svg width={22} height={22} viewBox="0 0 24 24" fill="none">
                  <Circle cx={12} cy={12} r={10} fill={colors.accent} stroke={colors.accent} strokeWidth={1.5} />
                  <Polyline points="9 12 11 14 15 10" stroke="#fff" strokeWidth={2} fill="none" strokeLinecap="round" strokeLinejoin="round" />
                </Svg>
              </View>
            )}
          </TouchableOpacity>
        );
      })}
      {!!user && (
        <View style={styles.footer}>
          {!!saveState.message && (
            <Text style={[styles.status, saveState.status === 'error' && { color: colors.danger }]}>{saveState.message}</Text>
          )}
          {saveState.status !== 'saved' && (
            <TouchableOpacity style={[styles.saveBtn, saveState.status === 'saving' && { opacity: 0.6 }]} onPress={saveAsList} disabled={saveState.status === 'saving'} activeOpacity={0.7} accessibilityRole="button">
              <Svg width={13} height={13} viewBox="0 0 24 24" fill="none" stroke={colors.textSecondary} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
                <Path d="M12 5v14M5 12h14" />
              </Svg>
              <Text style={styles.saveBtnText}>{saveState.status === 'saving' ? MEDIA_PANEL.savingCollection : MEDIA_PANEL.saveCollectionAsList}</Text>
            </TouchableOpacity>
          )}
        </View>
      )}
    </View>
  );
}

const makeStyles = (colors: Palette) => StyleSheet.create({
  run: { backgroundColor: colors.surfaceSunken, borderRadius: 20, padding: spacing.lg, marginBottom: spacing.lg },
  runCompact: { paddingHorizontal: spacing.md, paddingBottom: spacing.md },
  runHead: { flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between', gap: spacing.md, marginBottom: spacing.sm },
  runTitle: { fontFamily: fontFamily.display, fontSize: fontSize.lg, color: colors.textPrimary },
  runCount: { fontFamily: fontFamily.sansMedium, fontSize: fontSize.xs, color: colors.textSecondary },
  runBar: { flexDirection: 'row', gap: 4 },
  runSeg: { flex: 1, height: 8, borderRadius: radii.pill, backgroundColor: colors.border },
  runSegCompact: { height: 6 },
  runNext: { fontFamily: fontFamily.sans, fontSize: fontSize.xs, color: colors.textSecondary, marginTop: spacing.sm, lineHeight: 18 },
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, paddingVertical: spacing.sm + 2, paddingHorizontal: spacing.md, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border },
  rowCurrent: { backgroundColor: colors.accentDim },
  rowWatched: { opacity: 0.45 },
  rowPoster: { width: 42, aspectRatio: 2 / 3, borderRadius: 7, overflow: 'hidden', backgroundColor: colors.surfaceRaised, alignItems: 'center', justifyContent: 'center' },
  rowPosterFallback: { fontFamily: fontFamily.display, fontSize: fontSize.md, color: colors.textMuted },
  rowText: { flex: 1, minWidth: 0 },
  rowTitle: { fontFamily: fontFamily.sansBold, fontSize: fontSize.sm, color: colors.textPrimary },
  rowMeta: { fontFamily: fontFamily.sans, fontSize: fontSize.xs, color: colors.textSecondary, marginTop: 2 },
  footer: { flexDirection: 'row', alignItems: 'center', justifyContent: 'flex-end', gap: spacing.md, paddingVertical: spacing.sm + 2, paddingHorizontal: spacing.md },
  status: { flex: 1, fontFamily: fontFamily.sans, fontSize: fontSize.xs, color: colors.textMuted },
  saveBtn: { flexDirection: 'row', alignItems: 'center', gap: 5, minHeight: 36, paddingHorizontal: spacing.md, borderRadius: radii.pill, borderWidth: 1, borderColor: colors.borderStrong },
  saveBtnText: { fontFamily: fontFamily.sansMedium, fontSize: fontSize.xs, color: colors.textSecondary },
});
