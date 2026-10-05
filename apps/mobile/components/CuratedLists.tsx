// Lists Plot has put together: the card in Home's plot's Picks and the sheet
// that opens from it, with "Save to my lists". Mirrors
// apps/web/src/components/CuratedLists.jsx; the data, copy and the save
// (useCustomLists.copyCuratedList) are shared in @plot/core. Not shipped on
// mobile yet: rotation of the Picks row (issue 1190).
import { useMemo, useState } from 'react';
import { View, Text, Image, FlatList, Modal, Linking, TouchableOpacity, StyleSheet, Dimensions } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { CURATED_LISTS as COPY } from '@plot/core/copy/curatedLists.js';
import { customListCreationError, isCustomListLimitError } from '@plot/core/customListCreation.js';
import { findDuplicateCustomList } from '@plot/core/customLists.js';
import { canCreateCustomList } from '@plot/core/premium.js';
import { createUndoBatch, UNDO_ACTIONS } from '@plot/core/undo.js';
import type { CuratedList } from '@plot/core/curatedLists.js';
import { posterUrl, Palette, fontFamily, fontSize, spacing, radii } from '../lib/tokens';
import { useTheme } from '../contexts/ThemeContext';
import { track, EVENTS } from '../lib/analytics';
import UpgradeSheet from './UpgradeSheet';

/** The poster wall: six across, three down, as on web. */
const WALL_POSTERS = 18;
const WALL_COLS = 6;
const WALL_GAP = 3;
const PANEL_H = Dimensions.get('window').height * 0.92;

/**
 * The Picks card: the list's top posters as a tilted wall under the same dark
 * scrim, badge and title as the hero.
 */
export function CuratedListCard({ curated, width, height, onPress }: {
  curated: CuratedList;
  width: number;
  height: number;
  onPress: () => void;
}) {
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const posters = curated.entries.filter(entry => entry.poster_path).slice(0, WALL_POSTERS);
  // Oversized and rotated so the tiles bleed past every edge.
  const wallW = width * 1.35;
  const tileW = (wallW - WALL_GAP * (WALL_COLS - 1)) / WALL_COLS;
  return (
    <TouchableOpacity
      style={[styles.card, { width, height }]}
      onPress={onPress}
      activeOpacity={0.9}
      accessibilityRole="button"
      accessibilityLabel={`${curated.title}. ${COPY.titleCount(curated.entries.length)}`}
    >
      <View
        pointerEvents="none"
        style={{
          position: 'absolute', width: wallW, left: -(wallW - width) / 2, top: -height * 0.18,
          flexDirection: 'row', flexWrap: 'wrap', gap: WALL_GAP, transform: [{ rotate: '-7deg' }],
        }}
      >
        {posters.map(entry => (
          <Image
            key={entry.tmdb_id}
            source={{ uri: posterUrl(entry.poster_path, 'w185') ?? '' }}
            style={{ width: tileW, height: tileW * 1.5, borderRadius: 3, backgroundColor: colors.surfaceSunken }}
          />
        ))}
      </View>
      <LinearGradient
        pointerEvents="none"
        colors={['rgba(0,0,0,0.1)', 'rgba(0,0,0,0.3)', 'rgba(0,0,0,0.8)', 'rgba(0,0,0,0.94)']}
        locations={[0, 0.32, 0.64, 1]}
        style={StyleSheet.absoluteFill}
      />
      <View style={styles.content} pointerEvents="none">
        <View style={styles.badge}>
          <Text style={styles.badgeText}>{COPY.cardBadge.toUpperCase()}</Text>
        </View>
        <Text style={styles.title}>{curated.title}</Text>
        <Text style={styles.meta}>{COPY.cardMeta(curated.entries.length, curated.source.name)}</Text>
      </View>
    </TouchableOpacity>
  );
}

/** The slice of useCustomLists the sheet reads and calls. */
type CustomListsApi = {
  lists: { id: string; name: string }[];
  ownedCount?: number;
  copyCuratedList: (
    curated: CuratedList,
    opts?: { undo?: ReturnType<typeof createUndoBatch> | null; onUndone?: () => void },
  ) => Promise<{ list: { id: string; name: string }; existing: boolean } | null>;
};

type SaveState = { status: 'idle' | 'saving' | 'saved' | 'error'; message: string; listId: string | null };

/** The list in full, ranked, with "Save to my lists". */
export function CuratedListPanel({ curated, user, profile, customLists, onClose, onOpenTitle, onOpenMyLists, onCompare }: {
  curated: CuratedList;
  /** The viewer's account, from useAppData(); props rather than the context so the sheet renders in Storybook. */
  user: unknown;
  profile: unknown;
  customLists: CustomListsApi;
  onClose: () => void;
  onOpenTitle: (id: number, type: 'movie' | 'tv') => void;
  onOpenMyLists: () => void;
  /** "Compare every feature" on the upgrade sheet. */
  onCompare: () => void;
}) {
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const insets = useSafeAreaInsets();
  const [state, setState] = useState<SaveState>({ status: 'idle', message: '', listId: null });
  const [showUpgrade, setShowUpgrade] = useState(false);
  const existingList = findDuplicateCustomList(customLists?.lists || [], curated.title);
  const saving = state.status === 'saving';

  const save = async () => {
    if (!user || saving) return;
    const lists = customLists?.lists || [];
    if (!existingList && !canCreateCustomList(customLists?.ownedCount ?? lists.length, profile)) {
      track(EVENTS.PREMIUM_GATE_HIT, { feature: 'custom_lists' });
      setShowUpgrade(true);
      return;
    }
    setState({ status: 'saving', message: '', listId: null });
    // A new list offers Undo once every title is on it.
    const undo = existingList ? null : createUndoBatch({ action: UNDO_ACTIONS.LIST_CREATE });
    let result;
    try {
      result = await customLists.copyCuratedList(curated, { undo, onUndone: () => setState({ status: 'idle', message: '', listId: null }) });
    } catch (error) {
      if (isCustomListLimitError(error)) { setState({ status: 'idle', message: '', listId: null }); setShowUpgrade(true); return; }
      setState({ status: 'error', message: customListCreationError(error, COPY.couldNotSave), listId: null });
      return;
    }
    if (!result) { setState({ status: 'error', message: COPY.couldNotSave, listId: null }); return; }
    undo?.offer({ meta: { listName: result.list.name } });
    track(EVENTS.CURATED_LIST_SAVED, { curated_list: curated.id, titles: curated.entries.length, reused_list: result.existing });
    setState({ status: 'saved', message: result.existing ? COPY.savedAgain : COPY.saved, listId: result.list.id });
  };

  const openMine = () => {
    onClose();
    onOpenMyLists();
  };

  return (
    <Modal visible transparent animationType="slide" onRequestClose={onClose} statusBarTranslucent>
      <TouchableOpacity style={styles.overlay} onPress={onClose} activeOpacity={1} />
      <View style={[styles.panel, { paddingBottom: insets.bottom }]}>
        <View style={styles.panelHead}>
          <Text style={styles.panelTitle} numberOfLines={2}>{curated.title}</Text>
          <TouchableOpacity onPress={onClose} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }} accessibilityLabel={COPY.closeLabel} accessibilityRole="button">
            {/* Two bars rather than an Svg icon: react-native-svg does not load in the web Storybook. */}
            <View style={styles.closeIcon}>
              <View style={[styles.closeBar, { transform: [{ rotate: '45deg' }] }]} />
              <View style={[styles.closeBar, { transform: [{ rotate: '-45deg' }] }]} />
            </View>
          </TouchableOpacity>
        </View>
        <FlatList
          data={curated.entries}
          keyExtractor={entry => `${entry.media_type}-${entry.tmdb_id}`}
          ListHeaderComponent={(
            <View style={styles.intro}>
              <Text style={styles.blurb}>{curated.blurb}</Text>
              <TouchableOpacity onPress={() => Linking.openURL(curated.source.url)} accessibilityRole="link">
                <Text style={styles.source}>{COPY.viewSource}</Text>
              </TouchableOpacity>
            </View>
          )}
          renderItem={({ item: entry }) => (
            <TouchableOpacity
              style={styles.row}
              activeOpacity={0.7}
              accessibilityRole="button"
              onPress={() => { onClose(); onOpenTitle(entry.tmdb_id, entry.media_type); }}
            >
              <Text style={styles.rank}>{entry.rank}</Text>
              <View style={styles.rowPoster}>
                {entry.poster_path
                  ? <Image source={{ uri: posterUrl(entry.poster_path, 'w92') ?? '' }} style={StyleSheet.absoluteFill} />
                  : <Text style={styles.rowPosterFallback}>{entry.title.charAt(0)}</Text>}
              </View>
              <Text style={styles.rowTitle} numberOfLines={1}>{entry.title}</Text>
            </TouchableOpacity>
          )}
          initialNumToRender={14}
          showsVerticalScrollIndicator={false}
        />
        <View style={styles.footer}>
          {!!state.message && (
            <Text style={[styles.status, state.status === 'error' && { color: colors.danger }]}>{state.message}</Text>
          )}
          {!user && <Text style={styles.status}>{COPY.signIn}</Text>}
          {!!user && state.status === 'saved' && (
            <TouchableOpacity style={styles.primaryBtn} onPress={openMine} activeOpacity={0.8} accessibilityRole="button">
              <Text style={styles.primaryBtnText}>{COPY.openMine}</Text>
            </TouchableOpacity>
          )}
          {!!user && state.status !== 'saved' && (
            <TouchableOpacity style={[styles.primaryBtn, saving && { opacity: 0.6 }]} onPress={save} disabled={saving} activeOpacity={0.8} accessibilityRole="button">
              <Text style={styles.primaryBtnText}>{saving ? COPY.saving : COPY.save}</Text>
            </TouchableOpacity>
          )}
        </View>
      </View>
      <UpgradeSheet visible={showUpgrade} reason="lists" onClose={() => setShowUpgrade(false)} onCompare={onCompare} />
    </Modal>
  );
}

const makeStyles = (colors: Palette) => StyleSheet.create({
  card: { borderRadius: radii.lg, overflow: 'hidden', backgroundColor: colors.surfaceSunken },
  content: { position: 'absolute', left: spacing.lg, right: spacing.lg, bottom: spacing.lg },
  badge: {
    alignSelf: 'flex-start', backgroundColor: 'rgba(0,0,0,0.6)', borderWidth: 1, borderColor: colors.accent,
    borderRadius: radii.badge, paddingHorizontal: 8, paddingVertical: 3, marginBottom: spacing.sm,
  },
  badgeText: { fontFamily: fontFamily.sansBold, fontSize: fontSize.xs, color: colors.accent, letterSpacing: 0.8 },
  title: { fontFamily: fontFamily.display, fontSize: fontSize.xl, color: '#fff' },
  meta: { fontFamily: fontFamily.sans, fontSize: fontSize.xs, color: 'rgba(255,255,255,0.72)', marginTop: 2 },

  overlay: { ...StyleSheet.absoluteFill, backgroundColor: 'rgba(0,0,0,0.5)' },
  panel: {
    position: 'absolute', bottom: 0, left: 0, right: 0, height: PANEL_H, backgroundColor: colors.bg,
    borderTopLeftRadius: radii.lg, borderTopRightRadius: radii.lg, overflow: 'hidden',
  },
  panelHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: spacing.md, padding: spacing.xl, paddingBottom: spacing.md },
  closeIcon: { width: 18, height: 18, alignItems: 'center', justifyContent: 'center' },
  closeBar: { position: 'absolute', width: 20, height: 2.5, borderRadius: 2, backgroundColor: colors.textSecondary },
  panelTitle: { flex: 1, fontFamily: fontFamily.display, fontSize: fontSize.xl, color: colors.textPrimary },
  intro: { paddingHorizontal: spacing.xl, paddingBottom: spacing.md },
  blurb: { fontFamily: fontFamily.sans, fontSize: fontSize.sm, color: colors.textSecondary, lineHeight: 20 },
  source: { fontFamily: fontFamily.sans, fontSize: fontSize.xs, color: colors.textMuted, textDecorationLine: 'underline', marginTop: spacing.xs },
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, paddingHorizontal: spacing.xl, paddingVertical: spacing.sm, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border },
  rank: { width: 28, textAlign: 'right', fontFamily: fontFamily.sans, fontSize: fontSize.xs, color: colors.textMuted, fontVariant: ['tabular-nums'] },
  rowPoster: { width: 32, height: 48, borderRadius: 3, overflow: 'hidden', backgroundColor: colors.surfaceSunken, alignItems: 'center', justifyContent: 'center' },
  rowPosterFallback: { fontFamily: fontFamily.sansBold, color: colors.textMuted },
  rowTitle: { flex: 1, fontFamily: fontFamily.sansBold, fontSize: fontSize.sm, color: colors.textPrimary },
  footer: { flexDirection: 'row', alignItems: 'center', justifyContent: 'flex-end', gap: spacing.md, padding: spacing.lg, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border },
  status: { flex: 1, fontFamily: fontFamily.sans, fontSize: fontSize.sm, color: colors.textMuted },
  primaryBtn: { backgroundColor: colors.accentFill, borderRadius: radii.pill, paddingHorizontal: spacing.xl, paddingVertical: spacing.sm },
  primaryBtnText: { fontFamily: fontFamily.sansBold, fontSize: fontSize.sm, color: colors.onAccentFill },
});
