/**
 * The app's chips, per the shared design system.
 *
 *   Chip  a pill you press to pick or filter (genres, feedback type, sort,
 *         "By date"). Deeper cream when off, the pink fill with a charcoal
 *         label when on. One height per size, no outlines.
 *   Tag   a small label that only says something (Film, Series, Premium,
 *         a count). Never pressable. `neutral` is the deeper cream, `sage`
 *         marks a state (Watched, On your watchlist), `accent` marks the one
 *         lead per panel, `genre` is the pale pink tint a title's genres wear
 *         (charcoal text, as on web).
 *
 * Stateful action pills that carry their own meaning (Follow, Watchlist,
 * watch status) are not chips and keep their own components.
 */
import { useMemo, type ReactNode } from 'react';
import { StyleSheet, Text, TouchableOpacity, View, type StyleProp, type ViewStyle } from 'react-native';
import { useTheme } from '../contexts/ThemeContext';
import { Palette, fontFamily, fontSize, radii, spacing } from '../lib/tokens';

export const CHIP_H = { md: 34, sm: 28 } as const;

export default function Chip({ label, selected = false, onPress, size = 'md', quiet = false, icon, disabled = false, accessibilityLabel, accessibilityRole = 'button', style }: {
  label: string;
  selected?: boolean;
  onPress: () => void;
  size?: 'md' | 'sm';
  /** Chosen, but it is the row's "any": drawn like a segmented switch's chosen
   *  option, so the pink is left for a real choice. */
  quiet?: boolean;
  /** A small glyph before the label. */
  icon?: ReactNode;
  disabled?: boolean;
  accessibilityLabel?: string;
  /** `radio` for one-of-many, `checkbox` for any-of-many, `tab` for a tab row. */
  accessibilityRole?: 'button' | 'radio' | 'checkbox' | 'tab';
  /** Outer spacing only. */
  style?: StyleProp<ViewStyle>;
}) {
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  return (
    <TouchableOpacity
      onPress={onPress}
      disabled={disabled}
      activeOpacity={0.75}
      accessibilityRole={accessibilityRole}
      accessibilityLabel={accessibilityLabel ?? label}
      accessibilityState={accessibilityRole === 'checkbox' ? { checked: selected, disabled } : { selected, disabled }}
      style={[styles.chip, styles[size], selected && (quiet ? styles.onQuiet : styles.on), disabled && styles.off, style]}
    >
      {icon}
      <Text style={[styles.label, size === 'sm' && styles.labelSm, selected && (quiet ? styles.labelOnQuiet : styles.labelOn)]} numberOfLines={1}>{label}</Text>
    </TouchableOpacity>
  );
}

export type TagTone = 'neutral' | 'sage' | 'accent' | 'genre';

export function Tag({ label, tone = 'neutral', icon, style }: { label: string; tone?: TagTone; icon?: ReactNode; style?: StyleProp<ViewStyle> }) {
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  return (
    <View style={[styles.tag, styles[`tag_${tone}`], style]}>
      {icon}
      <Text style={[styles.tagText, styles[`tagText_${tone}`]]} numberOfLines={1}>{label}</Text>
    </View>
  );
}

/** A wrapping row of chips or tags with the standard gap. */
export function ChipRow({ children, style }: { children: ReactNode; style?: StyleProp<ViewStyle> }) {
  return <View style={[{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm }, style]}>{children}</View>;
}

const makeStyles = (colors: Palette) => StyleSheet.create({
  chip: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: spacing.xs, borderRadius: radii.pill, backgroundColor: colors.surfaceSunken },
  md: { minHeight: CHIP_H.md, paddingHorizontal: spacing.md },
  sm: { minHeight: CHIP_H.sm, paddingHorizontal: 10 },
  on: { backgroundColor: colors.accentFill },
  onQuiet: { backgroundColor: colors.surface, borderWidth: StyleSheet.hairlineWidth, borderColor: colors.borderStrong },
  labelOnQuiet: { color: colors.textPrimary },
  off: { opacity: 0.45 },
  label: { fontFamily: fontFamily.sansMedium, fontSize: fontSize.sm, color: colors.textSecondary },
  labelSm: { fontSize: fontSize.xs },
  labelOn: { color: colors.onAccentFill },
  tag: { flexDirection: 'row', alignItems: 'center', alignSelf: 'flex-start', gap: 4, paddingHorizontal: 8, paddingVertical: 2, borderRadius: radii.badge },
  tag_neutral: { backgroundColor: colors.surfaceSunken },
  tag_sage: { backgroundColor: colors.accentSecondaryFill },
  tag_accent: { backgroundColor: colors.accentDim },
  tag_genre: { backgroundColor: colors.accentDim },
  tagText: { fontFamily: fontFamily.sansMedium, fontSize: 11 },
  tagText_neutral: { color: colors.textSecondary },
  tagText_sage: { color: colors.onAccentSecondaryFill },
  tagText_accent: { color: colors.accentText },
  tagText_genre: { color: colors.textPrimary },
});
