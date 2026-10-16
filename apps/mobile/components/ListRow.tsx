/**
 * One title as a row: a small poster, the title, a line or two of detail, an
 * optional progress line, and optional controls on the right. The List card
 * style's version of a poster card (see PosterRail). Mirrors the rows web's
 * HomeLook.css makes out of its cards.
 */
import { useMemo, type ReactNode } from 'react';
import { Image, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useTheme } from '../contexts/ThemeContext';
import { Palette, fontFamily, fontSize, radii, spacing } from '../lib/tokens';

const POSTER_W = 44;

export default function ListRow({ posterUri, title, meta, progress, onPress, label, trailing }: {
  posterUri?: string | null;
  title: string;
  meta?: string;
  /** 0 to 1: a thin progress line under the text. */
  progress?: number;
  onPress: () => void;
  label?: string;
  /** Controls to the right of the row, outside the row's own press target. */
  trailing?: ReactNode;
}) {
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const pct = progress == null ? null : `${Math.round(Math.min(1, Math.max(0, progress)) * 100)}%` as `${number}%`;
  return (
    <View style={styles.row}>
      <TouchableOpacity style={styles.hit} onPress={onPress} accessibilityRole="button" accessibilityLabel={label ?? title} activeOpacity={0.7}>
        <View style={styles.poster}>
          {posterUri ? <Image source={{ uri: posterUri }} style={StyleSheet.absoluteFill} resizeMode="cover" /> : null}
        </View>
        <View style={styles.text}>
          <Text style={styles.title} numberOfLines={1}>{title}</Text>
          {meta ? <Text style={styles.meta} numberOfLines={1}>{meta}</Text> : null}
          {pct ? (
            <View style={styles.track}><View style={[styles.fill, { width: pct }]} /></View>
          ) : null}
        </View>
      </TouchableOpacity>
      {trailing}
    </View>
  );
}

const makeStyles = (colors: Palette) => StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, minHeight: 64 },
  hit: { flex: 1, minWidth: 0, flexDirection: 'row', alignItems: 'center', gap: spacing.md, paddingVertical: spacing.xs },
  poster: { width: POSTER_W, aspectRatio: 2 / 3, borderRadius: radii.sm, overflow: 'hidden', backgroundColor: colors.surfaceSunken },
  text: { flex: 1, minWidth: 0, gap: 2 },
  title: { fontFamily: fontFamily.sansMedium, fontSize: fontSize.sm, color: colors.textPrimary },
  meta: { fontFamily: fontFamily.sans, fontSize: fontSize.xs, color: colors.textMuted },
  track: { height: 3, marginTop: 4, borderRadius: radii.pill, backgroundColor: colors.borderStrong, overflow: 'hidden' },
  fill: { height: '100%', backgroundColor: colors.accent },
});
