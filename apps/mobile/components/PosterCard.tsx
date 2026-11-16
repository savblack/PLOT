/**
 * The one poster card: the art (2:3, round corners) and the caption under it
 * (the title in the text color on up to two lines, then one grey line of
 * meta: year and type, who added it, a role). The RN counterpart of web's
 * .media-card / .media-card-title / .media-card-meta. Home shelves, My Lists,
 * smart lists, Browse, a person's films, Just Decide and Watch Together all
 * draw their posters from these two parts, so a shelf looks the same on every
 * screen (round 5 of the November 2026 design review).
 *
 * The two parts stay separate so each screen keeps its own press target and
 * overlays (the bookmark, a status chip, a remove button) inside the art.
 * Left as they are on purpose: profile thumbnails, search result rows and the
 * onboarding picker.
 */
import { useMemo, type ReactNode } from 'react';
import { Dimensions, Image, StyleSheet, Text, View, type StyleProp, type ViewStyle } from 'react-native';
import { useTheme } from '../contexts/ThemeContext';
import { Palette, fontFamily, radii, spacing } from '../lib/tokens';

/** Space between posters in a row or grid. */
export const POSTER_GAP = spacing.md;
/** Three posters across the screen inside the usual side gutters. */
export const posterColumnWidth = (screenWidth = Dimensions.get('window').width) =>
  (screenWidth - spacing.xl * 2 - POSTER_GAP * 2) / 3;

export function PosterArt({ uri, width, dimmed = false, children, style }: {
  uri?: string | null;
  /** Omit to fill the parent's width. */
  width?: number;
  /** A finished title on a list fades back. */
  dimmed?: boolean;
  /** Overlays: corner buttons, a status chip. */
  children?: ReactNode;
  style?: StyleProp<ViewStyle>;
}) {
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  return (
    <View style={[styles.art, width != null ? { width } : null, style]}>
      {uri ? <Image source={{ uri }} style={[StyleSheet.absoluteFill, dimmed && styles.dimmed]} resizeMode="cover" /> : null}
      {children}
    </View>
  );
}

export function PosterCaption({ title, meta, metaLines = 1, dimmed = false }: {
  title: string;
  meta?: string | null;
  metaLines?: number;
  dimmed?: boolean;
}) {
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  return (
    <View style={styles.caption}>
      <Text style={[styles.title, dimmed && styles.titleDimmed]} numberOfLines={2}>{title}</Text>
      {!!meta && <Text style={styles.meta} numberOfLines={metaLines}>{meta}</Text>}
    </View>
  );
}

const makeStyles = (colors: Palette) => StyleSheet.create({
  art: { aspectRatio: 2 / 3, borderRadius: radii.md, overflow: 'hidden', backgroundColor: colors.surfaceSunken },
  dimmed: { opacity: 0.45 },
  caption: { marginTop: spacing.sm, gap: 2 },
  title: { fontFamily: fontFamily.sansBold, fontSize: 12, lineHeight: 16, color: colors.textPrimary },
  titleDimmed: { color: colors.textMuted },
  meta: { fontFamily: fontFamily.sans, fontSize: 11, lineHeight: 15, color: colors.textMuted },
});
