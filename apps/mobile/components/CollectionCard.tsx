// "Part of a collection": the franchise a movie belongs to, as a collapsible
// card. Mirrors apps/web/src/components/CollectionCard.jsx. The header is the
// tap target and carries the progress bar so the count reads in both states.
// Movies only: TMDB has no collection concept for series, which is also why
// "Save as list" exists. A saved collection is an ordinary custom list, and
// lists take TV.
import { useEffect, useMemo, useState } from 'react';
import { View, Text, Image, TouchableOpacity, StyleSheet } from 'react-native';
import Svg, { Path } from 'react-native-svg';
import { tmdb } from '../lib/tmdb';
import {
  collectionPartYear,
  collectionProgress,
  collectionStubFromDetails,
  orderedCollectionParts,
} from '@plot/core/collections.js';
import { findDuplicateCustomList } from '@plot/core/customLists.js';
import { canCreateCustomList, FREE_CUSTOM_LIST_CAP } from '@plot/core/premium.js';
import { MEDIA_PANEL } from '@plot/core/copy/mediaPanel.js';
import { posterUrl, Palette, fontFamily, fontSize, spacing, radii } from '../lib/tokens';
import { useTheme } from '../contexts/ThemeContext';
import { useAppData } from '../contexts/AppDataContext';
import { useMediaPanel } from '../contexts/MediaPanelContext';
import { track, EVENTS } from '../lib/analytics';
import { SHOW_PRICING_PAGE } from '../lib/launchFeatures';

type SaveState = { status: 'idle' | 'saving' | 'saved' | 'error'; message: string };

export default function CollectionCard({ details, itemId }: { details: any; itemId: number }) {
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const { user, profile, watchlist, history, customLists } = useAppData();
  const { open: openTitle } = useMediaPanel();

  const stub = collectionStubFromDetails(details);
  const collectionId = stub?.id ?? null;
  const [collection, setCollection] = useState<any>(null);
  const [open, setOpen] = useState(false);
  const [saveState, setSaveState] = useState<SaveState>({ status: 'idle', message: '' });

  useEffect(() => {
    setCollection(null);
    setOpen(false);
    setSaveState({ status: 'idle', message: '' });
    if (!collectionId) return undefined;
    let cancelled = false;
    tmdb.getCollection(collectionId).then((data: any) => {
      if (!cancelled && data) setCollection(data);
    });
    return () => { cancelled = true; };
  }, [collectionId]);

  if (!stub || !collection) return null;
  const parts = orderedCollectionParts(collection);
  if (parts.length < 2) return null;

  const { items, watched, total, fraction } = collectionProgress(parts, {
    currentId: itemId,
    isWatched: history.isWatched,
    isInWatchlist: watchlist.isInList,
  });
  const existingList = findDuplicateCustomList(customLists?.lists || [], stub.name);

  const saveAsList = async () => {
    if (!user || saveState.status === 'saving') return;
    const lists = customLists?.lists || [];
    if (!existingList && !canCreateCustomList(lists.length, profile)) {
      track(EVENTS.PREMIUM_GATE_HIT, { feature: 'custom_lists' });
      setSaveState({
        status: 'error',
        message: SHOW_PRICING_PAGE
          ? `Free accounts can have ${FREE_CUSTOM_LIST_CAP} lists. PLOT Premium gets unlimited.`
          : `You've reached the ${FREE_CUSTOM_LIST_CAP}-list limit.`,
      });
      return;
    }
    setSaveState({ status: 'saving', message: '' });
    const list = existingList || await customLists.createList(stub.name);
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

  const stack = items.slice(0, 4);

  return (
    <>
      <Text style={styles.heading}>{MEDIA_PANEL.partOfCollection}</Text>
      <View style={styles.card}>
        <TouchableOpacity style={styles.header} onPress={() => setOpen(v => !v)} activeOpacity={0.7} accessibilityRole="button" accessibilityState={{ expanded: open }}>
          <View style={styles.stack}>
            {stack.map((part: any) => (
              part.poster_path
                ? <Image key={part.id} source={{ uri: posterUrl(part.poster_path, 'w92') ?? '' }} style={styles.stackCell} />
                : <View key={part.id} style={styles.stackCell} />
            ))}
          </View>
          <View style={styles.titles}>
            <Text style={styles.name} numberOfLines={1}>{stub.name}</Text>
            <Text style={styles.count}>{MEDIA_PANEL.collectionProgress(watched, total)}</Text>
          </View>
          <View style={{ transform: [{ rotate: open ? '180deg' : '0deg' }] }}>
            <Svg width={16} height={16} viewBox="0 0 24 24" fill="none" stroke={colors.textSecondary} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
              <Path d="M6 9l6 6 6-6" />
            </Svg>
          </View>
        </TouchableOpacity>
        <View style={styles.bar}><View style={[styles.barFill, { width: `${Math.round(fraction * 100)}%` }]} /></View>
        {open && (
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
        )}
      </View>
    </>
  );
}

const makeStyles = (colors: Palette) => StyleSheet.create({
  // Same kicker as the panel's sectionTitle, with more air above: this is a
  // set you are part-way through, not another rail.
  heading: { fontFamily: fontFamily.sansBold, fontSize: 10, letterSpacing: 0.8, textTransform: 'uppercase', color: colors.textMuted, marginTop: spacing.lg * 1.8, marginBottom: spacing.md },
  card: { borderWidth: 1, borderColor: colors.border, borderRadius: radii.md, backgroundColor: colors.surface, overflow: 'hidden' },
  header: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, minHeight: 44, paddingVertical: spacing.md, paddingHorizontal: spacing.md },
  stack: { width: 40, flexDirection: 'row', flexWrap: 'wrap', gap: 2, borderRadius: 8, overflow: 'hidden' },
  stackCell: { width: 19, aspectRatio: 2 / 3, backgroundColor: colors.surfaceRaised },
  titles: { flex: 1, minWidth: 0, gap: 3 },
  name: { fontFamily: fontFamily.serif, fontSize: fontSize.lg, color: colors.textPrimary },
  count: { fontFamily: fontFamily.sans, fontSize: fontSize.xs, color: colors.textMuted },
  bar: { height: 3, backgroundColor: colors.surfaceSunken },
  barFill: { height: '100%', backgroundColor: colors.statusWatched },
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, paddingVertical: spacing.sm + 2, paddingHorizontal: spacing.md, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border },
  rowCurrent: { backgroundColor: colors.accentDim },
  rowPoster: { width: 42, aspectRatio: 2 / 3, borderRadius: 7, overflow: 'hidden', backgroundColor: colors.surfaceRaised, alignItems: 'center', justifyContent: 'center' },
  rowPosterFallback: { fontFamily: fontFamily.serif, fontSize: fontSize.md, color: colors.textMuted },
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
