/**
 * One Top 5 list (Movies or TV Shows). Viewing is web's podium: a large first
 * place beside a grid for ranks 2 to 5, the rank numeral on each poster, dashed
 * tiles for empty ranks, and one prompt when the list is empty. Edit mode swaps
 * to five fixed rank rows with reorder controls.
 *
 * Lives in components/ rather than its own screen because web renders Top 5 as
 * a section of My Lists, not a destination. Mobile's /top10 route is gone; this
 * is rendered twice inside the `top10` CollapsibleSection.
 *
 * Drag follows the web drop: edit mode only, the row under the finger is the
 * target, and one moveToRank swaps with that slot (or moves into it when empty).
 * The up and down buttons stay, and down stops at the last filled rank.
 */
import { useState, useMemo } from 'react';
import { View, Text, Image, TouchableOpacity, StyleSheet, PanResponder, Dimensions } from 'react-native';
import Svg, { Path, Polyline } from 'react-native-svg';
import SearchPickModal from './SearchPickModal';
import { posterUrl, Palette, fontFamily, fontSize, spacing, radii, iconButtonSize } from '../lib/tokens';
import { displayPosterPath } from '@plot/core/artwork.js';
import { useUserArtwork } from '@plot/core/useUserArtwork.js';
import { useTheme } from '../contexts/ThemeContext';
import { useMediaPanel } from '../contexts/MediaPanelContext';
import { TOP_LIST_SIZE } from '@plot/core/listCollections.js';
import { CUSTOM_LISTS } from '@plot/core/copy/customLists.js';

export type ListType = 'movies' | 'tv';

function RankRow({ rank, item, editMode, dragging, highlighted, dragDy, onRowLayout, onDragStart, onDragMove, onDragEnd, onRemove, onMoveUp, onMoveDown, canMoveUp = true, canMoveDown = true }: {
  rank: number;
  item: any | null;
  editMode: boolean;
  dragging?: boolean;
  highlighted?: boolean;
  dragDy?: number;
  onRowLayout?: (height: number) => void;
  onDragStart?: (rank: number) => void;
  onDragMove?: (rank: number, dy: number) => void;
  onDragEnd?: (rank: number, dy: number) => void;
  onRemove?: () => void;
  onMoveUp?: () => void;
  onMoveDown?: () => void;
  canMoveUp?: boolean;
  canMoveDown?: boolean;
}) {
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const art = useUserArtwork();
  const rankColor = rank === 1 ? colors.accent : rank <= 3 ? colors.textSecondary : colors.textMuted;
  const img = item ? posterUrl(displayPosterPath(art.apply(item)), 'w92') : null;
  const pan = PanResponder.create({
    onMoveShouldSetPanResponderCapture: (_, g) => Math.abs(g.dy) > 8 && Math.abs(g.dy) > Math.abs(g.dx),
    onPanResponderTerminationRequest: () => false,
    onPanResponderGrant: () => onDragStart?.(rank),
    onPanResponderMove: (_, g) => onDragMove?.(rank, g.dy),
    onPanResponderRelease: (_, g) => onDragEnd?.(rank, g.dy),
    onPanResponderTerminate: () => onDragEnd?.(rank, 0),
  });

  return (
    <View
      style={[
        styles.rankRow,
        highlighted && styles.rankRowTarget,
        dragging && { transform: [{ translateY: dragDy || 0 }], zIndex: 2, backgroundColor: colors.surface },
      ]}
      onLayout={event => onRowLayout?.(event.nativeEvent.layout.height)}
      accessibilityLabel={editMode && item ? `Reorder ${item.title}` : undefined}
      {...(editMode && item ? pan.panHandlers : {})}
    >
      <Text style={[styles.rankNum, { color: rankColor }]}>{rank}</Text>
      {item ? (
        <>
          <View style={styles.rankPoster}>
            {img
              ? <Image source={{ uri: img }} style={StyleSheet.absoluteFill} resizeMode="cover" />
              : <View style={[StyleSheet.absoluteFill, { backgroundColor: colors.surfaceSunken }]} />
            }
          </View>
          <Text style={styles.rankTitle} numberOfLines={1}>{item.title}</Text>
          {editMode && (
            <View style={styles.rankActions}>
              <TouchableOpacity
                onPress={onMoveUp}
                disabled={!canMoveUp}
                style={styles.rankActionBtn}
                hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
                accessibilityLabel="Move up in ranking"
                accessibilityRole="button"
              >
                <Text style={{ color: canMoveUp ? colors.textPrimary : colors.textMuted, fontSize: 14, opacity: canMoveUp ? 1 : 0.3 }}>↑</Text>
              </TouchableOpacity>
              <TouchableOpacity
                onPress={onMoveDown}
                disabled={!canMoveDown}
                style={styles.rankActionBtn}
                hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
                accessibilityLabel="Move down in ranking"
                accessibilityRole="button"
              >
                <Text style={{ color: canMoveDown ? colors.textPrimary : colors.textMuted, fontSize: 14, opacity: canMoveDown ? 1 : 0.3 }}>↓</Text>
              </TouchableOpacity>
              <TouchableOpacity
                onPress={onRemove}
                style={styles.rankActionBtn}
                hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
                accessibilityLabel="Remove from Top 5"
                accessibilityRole="button"
              >
                <Text style={{ color: colors.textMuted, fontSize: 12 }}>✕</Text>
              </TouchableOpacity>
            </View>
          )}
        </>
      ) : (
        <>
          <View style={styles.rankEmptyPoster}>
            <Text style={{ color: colors.textMuted, fontSize: 16 }}>+</Text>
          </View>
          <Text style={styles.rankEmptyPrompt}>
            {rank === 1 ? "What's your GOAT?" : 'Add a title'}
          </Text>
        </>
      )}
    </View>
  );
}

/** A ranked entry as the Top 5 hook returns it. */
interface TopEntry { tmdb_id?: number; title?: string; rank?: number; poster_path?: string | null }

const SCREEN_W = Dimensions.get('window').width;
const PODIUM_GAP = spacing.sm;
const PODIUM_CONTENT = SCREEN_W - spacing.xl * 2;
const FIRST_W = Math.floor(PODIUM_CONTENT * 0.5);
const FIRST_H = Math.round(FIRST_W * 1.5);
const SMALL_W = Math.floor((PODIUM_CONTENT - FIRST_W - PODIUM_GAP * 2) / 2);
const SMALL_H = Math.floor((FIRST_H - PODIUM_GAP) / 2);

// One podium tile: a poster with the rank numeral on it, or a dashed "+" when
// the rank is empty. Filled tiles open the title panel; empty ones add.
function PodiumTile({ rank, item, width, height, onOpen, onAdd }: {
  rank: number; item: TopEntry | null; width: number; height: number;
  onOpen: (item: TopEntry) => void; onAdd: (rank: number) => void;
}) {
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const art = useUserArtwork();
  const img = item ? posterUrl(displayPosterPath(art.apply(item)), rank === 1 ? 'w342' : 'w185') : null;
  if (!item) {
    return (
      <TouchableOpacity
        style={[styles.podiumEmpty, { width, height }]}
        onPress={() => onAdd(rank)}
        activeOpacity={0.7}
        accessibilityRole="button"
        accessibilityLabel={`Add a title at number ${rank}`}
      >
        <Text style={styles.podiumNum}>{rank}</Text>
        <Text style={{ color: colors.textMuted, fontSize: 18 }}>+</Text>
      </TouchableOpacity>
    );
  }
  return (
    <TouchableOpacity
      style={[styles.podiumTile, { width, height }]}
      onPress={() => onOpen(item)}
      activeOpacity={0.8}
      accessibilityRole="button"
      accessibilityLabel={`Number ${rank}, ${item.title}`}
    >
      {img
        ? <Image source={{ uri: img }} style={StyleSheet.absoluteFill} resizeMode="cover" />
        : <View style={[StyleSheet.absoluteFill, { backgroundColor: colors.surfaceSunken }]} />
      }
      <Text style={[styles.podiumNum, styles.podiumNumOnPoster, rank === 1 && { fontSize: 44 }]}>{rank}</Text>
    </TouchableOpacity>
  );
}

export function TopTenSection({ listType, title, topLists, history, onDraggingChange }: {
  listType: ListType;
  title: string;
  topLists: any;
  history: any[];
  onDraggingChange?: (dragging: boolean) => void;
}) {
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const [editMode,   setEditMode]   = useState(false);
  const [addingRank, setAddingRank] = useState<number | null>(null);
  const [drag, setDrag] = useState<{ from: number; dy: number } | null>(null);
  const [rowH, setRowH] = useState(70);
  const { open: openPanel } = useMediaPanel();

  const items = topLists.lists[listType] || [];
  const maxRank = items.reduce((max: number, item: { rank?: number }) => Math.max(max, item.rank || 0), 0);
  const slots = Array.from({ length: TOP_LIST_SIZE }, (_, i) => i + 1);
  const dragTarget = drag
    ? Math.min(TOP_LIST_SIZE, Math.max(1, drag.from + Math.round(drag.dy / rowH)))
    : null;

  const finishDrag = (rank: number, dy: number) => {
    const target = Math.min(TOP_LIST_SIZE, Math.max(1, rank + Math.round(dy / rowH)));
    setDrag(null);
    onDraggingChange?.(false);
    if (target !== rank) topLists.moveToRank(listType, rank, target);
  };

  const byRank = (rank: number): TopEntry | null => items.find((i: TopEntry) => i.rank === rank) || null;
  const openTitle = (item: TopEntry) => item.tmdb_id && openPanel(item.tmdb_id, listType === 'movies' ? 'movie' : 'tv');

  return (
    <View>
      <View style={styles.sectionHeader}>
        <Text style={styles.sectionTypeLabel}>{title}</Text>
        {items.length > 0 && (
          <TouchableOpacity onPress={() => setEditMode(m => !m)} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
            <Text style={{ color: colors.accent, fontFamily: fontFamily.sansMedium, fontSize: fontSize.sm }}>
              {editMode ? 'Done' : 'Edit'}
            </Text>
          </TouchableOpacity>
        )}
      </View>

      {!editMode && items.length === 0 && (
        <TouchableOpacity style={styles.topEmpty} onPress={() => setAddingRank(1)} activeOpacity={0.7} accessibilityRole="button" accessibilityLabel={`Start your Top 5 ${title}`}>
          <View style={{ flex: 1 }}>
            <Text style={styles.topEmptyTitle}>{CUSTOM_LISTS.emptyPrompts.topFive.title(title)}</Text>
            <Text style={styles.topEmptyBody}>{CUSTOM_LISTS.emptyPrompts.topFive.body}</Text>
          </View>
          <Text style={styles.topEmptyAction}>{CUSTOM_LISTS.emptyPrompts.topFive.action}</Text>
        </TouchableOpacity>
      )}

      {!editMode && items.length > 0 && (
        <View style={styles.podium}>
          <PodiumTile rank={1} item={byRank(1)} width={FIRST_W} height={FIRST_H} onOpen={openTitle} onAdd={setAddingRank} />
          <View style={styles.podiumRest}>
            {[2, 3, 4, 5].map(rank => (
              <PodiumTile key={rank} rank={rank} item={byRank(rank)} width={SMALL_W} height={SMALL_H} onOpen={openTitle} onAdd={setAddingRank} />
            ))}
          </View>
        </View>
      )}

      {editMode && slots.map(rank => {
        const item = items.find((i: { rank?: number }) => i.rank === rank);
        const row = (
          <RankRow
            rank={rank}
            item={item || null}
            editMode={editMode}
            dragging={drag?.from === rank}
            highlighted={dragTarget === rank && drag?.from !== rank}
            dragDy={drag?.from === rank ? drag.dy : 0}
            onRowLayout={height => { if (height > 0) setRowH(prev => (prev === height ? prev : height)); }}
            onDragStart={from => { onDraggingChange?.(true); setDrag({ from, dy: 0 }); }}
            onDragMove={(from, dy) => setDrag({ from, dy })}
            onDragEnd={finishDrag}
            canMoveUp={rank !== 1}
            canMoveDown={rank < maxRank}
            onRemove={() => item && topLists.removeSlot(listType, item.tmdb_id)}
            onMoveUp={() => topLists.moveUp(listType, rank)}
            onMoveDown={() => topLists.moveDown(listType, rank)}
          />
        );
        if (item) return <View key={rank}>{row}</View>;
        return (
          <TouchableOpacity key={rank} onPress={() => setAddingRank(rank)} activeOpacity={0.7}>
            {row}
          </TouchableOpacity>
        );
      })}

      {addingRank !== null && (
        <SearchPickModal
          title={`Select #${addingRank} ${listType === 'movies' ? 'Movie' : 'TV Show'}`}
          mediaFilter={listType === 'movies' ? 'movie' : 'tv'}
          historyEntries={history}
          onSelect={(item) => topLists.setSlot(listType, addingRank, item)}
          onClose={() => setAddingRank(null)}
        />
      )}
    </View>
  );
}

const makeStyles = (colors: Palette) => StyleSheet.create({
  rankActionBtn: { width: iconButtonSize.md, height: iconButtonSize.md, alignItems: 'center', justifyContent: 'center' },

  // Modal
  rankActions: { flexDirection: 'row', gap: 2 },
  rankEmptyPoster: {
    width: 36, height: 54,
    borderRadius: radii.sm,
    borderWidth: 1.5,
    borderStyle: 'dashed',
    borderColor: colors.borderStrong,
    alignItems: 'center',
    justifyContent: 'center',
  },
  rankEmptyPrompt: {
    flex: 1,
    fontFamily: fontFamily.display,
    fontSize: fontSize.sm,
    color: colors.textMuted,
  },
  rankNum: {
    fontFamily: fontFamily.display,
    fontSize: 22,
    width: 28,
    textAlign: 'center',
  },
  rankPoster: {
    width: 36, height: 54,
    borderRadius: radii.sm,
    overflow: 'hidden',
    backgroundColor: colors.surfaceSunken,
    flexShrink: 0,
  },
  rankRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.xl,
    paddingVertical: spacing.sm,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
    gap: spacing.md,
    backgroundColor: colors.bg,
  },
  rankRowTarget: {
    backgroundColor: colors.accentDim,
  },
  rankTitle: {
    flex: 1,
    fontFamily: fontFamily.sansMedium,
    fontSize: fontSize.sm,
    color: colors.textPrimary,
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.xl,
    paddingVertical: spacing.sm,
  },
  sectionTypeLabel: {
    fontFamily: fontFamily.display,
    fontSize: fontSize.lg,
    color: colors.textPrimary,
  },
  podium: { flexDirection: 'row', gap: PODIUM_GAP, paddingHorizontal: spacing.xl, paddingBottom: spacing.md },
  podiumRest: { flexDirection: 'row', flexWrap: 'wrap', gap: PODIUM_GAP, width: SMALL_W * 2 + PODIUM_GAP },
  podiumTile: { borderRadius: radii.md, overflow: 'hidden', backgroundColor: colors.surfaceSunken },
  podiumEmpty: {
    borderRadius: radii.md, borderWidth: 1.5, borderStyle: 'dashed', borderColor: colors.borderStrong,
    alignItems: 'center', justifyContent: 'center', gap: spacing.xs,
  },
  podiumNum: { fontFamily: fontFamily.display, fontSize: 28, color: colors.textMuted },
  podiumNumOnPoster: {
    position: 'absolute', left: spacing.sm, bottom: spacing.xs, color: '#fff',
    textShadowColor: 'rgba(0,0,0,0.55)', textShadowOffset: { width: 0, height: 1 }, textShadowRadius: 6,
  },
  topEmpty: {
    marginHorizontal: spacing.xl, marginBottom: spacing.md, padding: spacing.lg,
    flexDirection: 'row', alignItems: 'center', gap: spacing.md,
    borderRadius: radii.lg, borderWidth: 1.5, borderStyle: 'dashed', borderColor: colors.borderStrong,
  },
  topEmptyTitle: { fontFamily: fontFamily.sansMedium, fontSize: fontSize.md, color: colors.textPrimary },
  topEmptyBody: { fontFamily: fontFamily.sans, fontSize: fontSize.sm, color: colors.textMuted, marginTop: 2 },
  topEmptyAction: { fontFamily: fontFamily.sansMedium, fontSize: fontSize.sm, color: colors.accent },
});
