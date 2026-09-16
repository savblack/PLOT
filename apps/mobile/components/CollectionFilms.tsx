import { customListCreationError } from '@plot/core/customListCreation.js';
import { CUSTOM_LISTS } from '@plot/core/copy/customLists.js';
// The films of a collection as rows, plus the "Save as list" footer. Used
// inside the collapsible card on a movie and as the body of the collection
// panel opened from search. Mirrors apps/web/src/components/CollectionFilms.jsx.
import { useMemo, useState } from 'react';
import { View, Text, Image, TouchableOpacity, StyleSheet } from 'react-native';
import Svg, { Path } from 'react-native-svg';
import { collectionPartYear, collectionProgress } from '@plot/core/collections.js';
import { findDuplicateCustomList } from '@plot/core/customLists.js';
import { canCreateCustomList } from '@plot/core/premium.js';
import { MEDIA_PANEL } from '@plot/core/copy/mediaPanel.js';
import { posterUrl, Palette, fontFamily, fontSize, spacing, radii } from '../lib/tokens';
import { useTheme } from '../contexts/ThemeContext';
import { useAppData } from '../contexts/AppDataContext';
import { useMediaPanel } from '../contexts/MediaPanelContext';
import { track, EVENTS } from '../lib/analytics';

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

export function CollectionProgressBar({ fraction }: { fraction: number }) {
  const { colors } = useTheme();
  return (
    <View style={{ height: 3, backgroundColor: colors.surfaceSunken }}>
      <View style={{ width: `${Math.round(fraction * 100)}%`, height: '100%', backgroundColor: colors.statusWatched }} />
    </View>
  );
}

export default function CollectionFilms({ stub, parts, items }: { stub: { id: number; name: string }; parts: any[]; items: any[] }) {
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const { user, profile, customLists } = useAppData();
  const { open: openTitle } = useMediaPanel();
  const [saveState, setSaveState] = useState<SaveState>({ status: 'idle', message: '' });
  const existingList = findDuplicateCustomList(customLists?.lists || [], stub.name);

  const saveAsList = async () => {
    if (!user || saveState.status === 'saving') return;
    const lists = customLists?.lists || [];
    if (!existingList && !canCreateCustomList(lists.length, profile)) {
      track(EVENTS.PREMIUM_GATE_HIT, { feature: 'custom_lists' });
      setSaveState({
        status: 'error',
        message: CUSTOM_LISTS.limitMessage,
      });
      return;
    }
    setSaveState({ status: 'saving', message: '' });
    let list;
    try {
      list = existingList || await customLists.createList(stub.name);
    } catch (error) {
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
      {items.map((part: any) => {
        const year = collectionPartYear(part);
        const meta = part.isCurrent ? [year, MEDIA_PANEL.viewing].filter(Boolean).join(' · ') : year;
        return (
          <TouchableOpacity
            key={part.id}
            style={[styles.row, part.isCurrent && styles.rowCurrent]}
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
            {part.watched && <View style={[styles.chip, styles.chipWatched]}><Text style={[styles.chipText, { color: colors.statusWatched }]}>WATCHED</Text></View>}
            {part.inWatchlist && <View style={[styles.chip, styles.chipListed]}><Text style={[styles.chipText, { color: colors.textSecondary }]}>WATCHLIST</Text></View>}
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
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, paddingVertical: spacing.sm + 2, paddingHorizontal: spacing.md, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border },
  rowCurrent: { backgroundColor: colors.accentDim },
  rowPoster: { width: 42, aspectRatio: 2 / 3, borderRadius: 7, overflow: 'hidden', backgroundColor: colors.surfaceRaised, alignItems: 'center', justifyContent: 'center' },
  rowPosterFallback: { fontFamily: fontFamily.display, fontSize: fontSize.md, color: colors.textMuted },
  rowText: { flex: 1, minWidth: 0 },
  rowTitle: { fontFamily: fontFamily.sansBold, fontSize: fontSize.sm, color: colors.textPrimary },
  rowMeta: { fontFamily: fontFamily.sans, fontSize: fontSize.xs, color: colors.textSecondary, marginTop: 2 },
  chip: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: radii.badge },
  chipWatched: { backgroundColor: colors.statusWatchedDim },
  chipListed: { borderWidth: 1, borderColor: colors.borderStrong },
  chipText: { fontFamily: fontFamily.sansBold, fontSize: 9, letterSpacing: 0.5 },
  footer: { flexDirection: 'row', alignItems: 'center', justifyContent: 'flex-end', gap: spacing.md, paddingVertical: spacing.sm + 2, paddingHorizontal: spacing.md },
  status: { flex: 1, fontFamily: fontFamily.sans, fontSize: fontSize.xs, color: colors.textMuted },
  saveBtn: { flexDirection: 'row', alignItems: 'center', gap: 5, minHeight: 36, paddingHorizontal: spacing.md, borderRadius: radii.pill, borderWidth: 1, borderColor: colors.borderStrong },
  saveBtnText: { fontFamily: fontFamily.sansMedium, fontSize: fontSize.xs, color: colors.textSecondary },
});
