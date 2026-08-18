/**
 * One Top 10 list (Movies or TV Shows) — ten fixed rank slots, dashed
 * placeholders for empties, reorder controls in edit mode.
 *
 * Lives in components/ rather than its own screen because web renders Top 10 as
 * a section of My Lists, not a destination. Mobile's /top10 route is gone; this
 * is rendered twice inside the `top10` CollapsibleSection.
 */
import { useState, useMemo } from 'react';
import { View, Text, Image, TouchableOpacity, StyleSheet } from 'react-native';
import Svg, { Path, Polyline } from 'react-native-svg';
import SearchPickModal from './SearchPickModal';
import { posterUrl, Palette, fontFamily, fontSize, spacing, radii, iconButtonSize } from '../lib/tokens';
import { useTheme } from '../contexts/ThemeContext';

export type ListType = 'movies' | 'tv';

function RankRow({ rank, item, editMode, onRemove, onMoveUp, onMoveDown, canMoveUp = true, canMoveDown = true }: {
  rank: number;
  item: any | null;
  editMode: boolean;
  onRemove?: () => void;
  onMoveUp?: () => void;
  onMoveDown?: () => void;
  canMoveUp?: boolean;
  canMoveDown?: boolean;
}) {
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const rankColor = rank === 1 ? colors.accent : rank <= 3 ? colors.textSecondary : colors.textMuted;
  const img = item ? posterUrl(item.poster_path, 'w92') : null;

  return (
    <View style={styles.rankRow}>
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
                accessibilityLabel="Remove from Top 10"
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

export function TopTenSection({ listType, title, topLists, history }: {
  listType: ListType;
  title: string;
  topLists: any;
  history: any[];
}) {
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const [editMode,   setEditMode]   = useState(false);
  const [addingRank, setAddingRank] = useState<number | null>(null);

  const items = topLists.lists[listType] || [];
  const slots = Array.from({ length: 10 }, (_, i) => i + 1);

  return (
    <View>
      <View style={styles.sectionHeader}>
        <Text style={styles.sectionTypeLabel}>{title}</Text>
        {items.length > 0 && (
          <TouchableOpacity onPress={() => setEditMode(m => !m)}>
            <Text style={{ color: colors.accent, fontFamily: fontFamily.sansMedium, fontSize: fontSize.sm }}>
              {editMode ? 'Done' : 'Edit'}
            </Text>
          </TouchableOpacity>
        )}
      </View>

      {slots.map(rank => {
        const item = items.find((i: any) => i.rank === rank);
        return (
          <TouchableOpacity
            key={rank}
            onPress={() => !item && setAddingRank(rank)}
            activeOpacity={item ? 1 : 0.7}
          >
            <RankRow
              rank={rank}
              item={item || null}
              editMode={editMode}
              canMoveUp={rank !== 1}
              canMoveDown={rank !== 10}
              onRemove={() => item && topLists.removeSlot(listType, item.tmdb_id)}
              onMoveUp={() => topLists.moveUp(listType, rank)}
              onMoveDown={() => topLists.moveDown(listType, rank)}
            />
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
    fontFamily: fontFamily.serifItalic,
    fontSize: fontSize.sm,
    color: colors.textMuted,
  },
  rankNum: {
    fontFamily: fontFamily.serif,
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
    paddingVertical: spacing.md,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
    backgroundColor: colors.surfaceRaised,
  },
  sectionTypeLabel: {
    fontFamily: fontFamily.sansBold,
    fontSize: 10,
    letterSpacing: 0.6,
    textTransform: 'uppercase',
    color: colors.textMuted,
  },
});
