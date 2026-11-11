/**
 * A list on My Lists, drawn as web draws it: three posters fanned behind one
 * another, the name and a count under them. Tapping it opens the list's own
 * view. `NewListCover` is the same shape with a dashed sheet and a plus.
 *
 * RN counterpart of apps/web/src/components/ListCover.jsx; the fan's
 * proportions (front sheet 57% of the cover's width, side sheets pushed out
 * by 36% of that and scaled to 88%) are web's.
 */
import { useMemo, type ReactNode } from 'react';
import { View, Text, Image, TouchableOpacity, StyleSheet, Dimensions } from 'react-native';
import Svg, { Path } from 'react-native-svg';
import { useTheme } from '../contexts/ThemeContext';
import { Palette, fontFamily, fontSize, spacing, posterUrl } from '../lib/tokens';

export const COVER_GAP = spacing.lg;
/** Two covers to a row, inside the page gutter. */
export const COVER_W = Math.floor((Dimensions.get('window').width - spacing.xl * 2 - COVER_GAP) / 2);
const FRONT_W = Math.round(COVER_W * 0.57);
const FRONT_H = Math.round(FRONT_W * 1.5);
const SIDE_SHIFT = Math.round(FRONT_W * 0.36);

function Sheet({ path, side }: { path?: string | null; side: 'left' | 'right' | 'front' }) {
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const uri = path ? posterUrl(path, 'w185') : null;
  const place = side === 'front' ? styles.front : side === 'left' ? styles.left : styles.right;
  return (
    <View style={[styles.sheet, place, !uri && styles.sheetEmpty]}>
      {uri ? <Image source={{ uri }} style={StyleSheet.absoluteFill} resizeMode="cover" /> : null}
    </View>
  );
}

export default function ListCover({ name, count, posters, badge, byline, trailing, dim, onPress }: {
  name: string;
  count: string;
  /** Poster paths, newest first; the first three are drawn. */
  posters: (string | null | undefined)[];
  badge?: string | null;
  byline?: string | null;
  /** Sits at the right of the label row (a "2 new" count). */
  trailing?: ReactNode;
  dim?: boolean;
  onPress: () => void;
}) {
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  return (
    <TouchableOpacity style={[styles.cover, dim && { opacity: 0.45 }]} onPress={onPress} activeOpacity={0.8} accessibilityRole="button" accessibilityLabel={`${name}, ${count}`}>
      <View style={styles.art}>
        <Sheet path={posters[1]} side="left" />
        <Sheet path={posters[2]} side="right" />
        <Sheet path={posters[0]} side="front" />
      </View>
      <View style={styles.nameRow}>
        <Text style={styles.name} numberOfLines={2}>{name}</Text>
        {badge ? <Text style={styles.badge}>{badge}</Text> : null}
      </View>
      <View style={styles.countRow}>
        <Text style={styles.count} numberOfLines={1}>{count}</Text>
        {trailing}
      </View>
      {byline ? <Text style={styles.count} numberOfLines={1}>{byline}</Text> : null}
    </TouchableOpacity>
  );
}

export function NewListCover({ label, note, onPress }: { label: string; note?: string; onPress: () => void }) {
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  return (
    <TouchableOpacity style={styles.cover} onPress={onPress} activeOpacity={0.7} accessibilityRole="button" accessibilityLabel={label}>
      <View style={styles.art}>
        <View style={[styles.sheet, styles.front, styles.newSheet]}>
          <Svg width={22} height={22} viewBox="0 0 24 24" fill="none" stroke={colors.textMuted} strokeWidth={2} strokeLinecap="round">
            <Path d="M12 5v14M5 12h14" />
          </Svg>
        </View>
      </View>
      <Text style={[styles.name, { color: colors.textMuted }]} numberOfLines={1}>{label}</Text>
      {note ? <Text style={styles.count} numberOfLines={1}>{note}</Text> : null}
    </TouchableOpacity>
  );
}

const makeStyles = (colors: Palette) => StyleSheet.create({
  cover: { width: COVER_W, gap: 2 },
  art: { height: FRONT_H, marginBottom: spacing.md, alignItems: 'center', justifyContent: 'flex-end' },
  sheet: {
    position: 'absolute', bottom: 0, width: FRONT_W, height: FRONT_H, borderRadius: 10, overflow: 'hidden',
    backgroundColor: colors.surfaceRaised, borderWidth: 1, borderColor: colors.border,
  },
  // An unfilled slot is a faint sheet, so a one-title list still reads as a stack.
  sheetEmpty: { backgroundColor: colors.surfaceSunken, borderStyle: 'dashed', borderColor: colors.borderStrong },
  front: { zIndex: 2 },
  left: { transform: [{ translateX: -SIDE_SHIFT }, { scale: 0.88 }], zIndex: 1 },
  right: { transform: [{ translateX: SIDE_SHIFT }, { scale: 0.88 }], zIndex: 1 },
  newSheet: { backgroundColor: 'transparent', borderStyle: 'dashed', borderWidth: 1.5, borderColor: colors.borderStrong, alignItems: 'center', justifyContent: 'center' },
  nameRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  name: { flexShrink: 1, fontFamily: fontFamily.display, fontSize: fontSize.md, color: colors.textPrimary },
  badge: {
    fontFamily: fontFamily.sansBold, fontSize: 9, letterSpacing: 0.6, textTransform: 'uppercase', color: colors.accentText,
    borderWidth: 1, borderColor: colors.accentText, borderRadius: 999, paddingHorizontal: 6, paddingVertical: 1,
  },
  countRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: spacing.sm },
  count: { fontFamily: fontFamily.sans, fontSize: fontSize.xs, color: colors.textMuted },
});
