/**
 * The app's buttons. One pill shape in four fills, per the shared design
 * system (docs/design/shared-design-system.md): no outline buttons.
 *
 *   primary    pink fill, charcoal label. The one action a screen or sheet
 *              is for.
 *   secondary  the deeper cream. Everything else.
 *   ink        charcoal with a cream label, for the rare emphatic case.
 *   danger     the deeper cream with a danger label (delete, leave).
 *
 * Sized to its label, never full width. `flex` is only for the row of two
 * at the foot of a sheet, where the pair shares the row in equal widths.
 * `TextLink` is the quiet text action that sits beside or under a button
 * (Not now, Cancel, Compare plans).
 */
import { useMemo, type ReactNode } from 'react';
import { ActivityIndicator, StyleSheet, Text, TouchableOpacity, View, type StyleProp, type ViewStyle } from 'react-native';
import { useTheme } from '../contexts/ThemeContext';
import { Palette, fontFamily, fontSize, radii, spacing } from '../lib/tokens';

export type ButtonVariant = 'primary' | 'secondary' | 'ink' | 'danger';
export type ButtonSize = 'md' | 'sm';

export const BUTTON_H = { md: 44, sm: 36 } as const;

type Props = {
  label: string;
  onPress: () => void;
  variant?: ButtonVariant;
  size?: ButtonSize;
  disabled?: boolean;
  /** Shows a spinner in place of the label and ignores presses. */
  busy?: boolean;
  /** Share a sheet's action row in equal widths. Sheets only. */
  flex?: boolean;
  /** A small glyph before the label. */
  icon?: ReactNode;
  accessibilityLabel?: string;
  /** Outer spacing only (margins, alignSelf). */
  style?: StyleProp<ViewStyle>;
  testID?: string;
};

export default function Button({ label, onPress, variant = 'secondary', size = 'md', disabled = false, busy = false, flex = false, icon, accessibilityLabel, style, testID }: Props) {
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const off = disabled || busy;
  const ink = variant === 'primary' ? colors.onAccentFill : variant === 'ink' ? colors.bg : variant === 'danger' ? colors.danger : colors.textPrimary;
  return (
    <TouchableOpacity
      onPress={onPress}
      disabled={off}
      activeOpacity={0.75}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? label}
      accessibilityState={{ disabled: off, busy }}
      testID={testID}
      style={[styles.base, styles[size], styles[variant], flex ? styles.flex : styles.hug, disabled && styles.off, style]}
    >
      {busy ? <ActivityIndicator size="small" color={ink} /> : (
        <View style={styles.inner}>
          {icon}
          <Text style={[styles.label, { color: ink }]} numberOfLines={1}>{label}</Text>
        </View>
      )}
    </TouchableOpacity>
  );
}

export function TextLink({ label, onPress, quiet = false, tone, disabled = false, accessibilityRole = 'button', accessibilityLabel, style }: {
  label: string;
  onPress: () => void;
  /** Muted instead of primary text: the "Not now" beside a real action. */
  quiet?: boolean;
  /** `accent` for an in-row action (Edit, View profile); `danger` for
   *  Sign out or Remove. Leave unset beside a button. */
  tone?: 'accent' | 'danger';
  accessibilityLabel?: string;
  disabled?: boolean;
  accessibilityRole?: 'button' | 'link';
  style?: StyleProp<ViewStyle>;
}) {
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  return (
    <TouchableOpacity onPress={onPress} disabled={disabled} accessibilityRole={accessibilityRole} accessibilityLabel={accessibilityLabel ?? label} hitSlop={{ top: 12, bottom: 12, left: 8, right: 8 }} style={[styles.link, disabled && styles.off, style]}>
      <Text style={[styles.linkText, quiet && styles.linkQuiet, tone === 'accent' && styles.linkAccent, tone === 'danger' && styles.linkDanger]} numberOfLines={1}>{label}</Text>
    </TouchableOpacity>
  );
}

const makeStyles = (colors: Palette) => StyleSheet.create({
  base: { alignItems: 'center', justifyContent: 'center', borderRadius: radii.pill },
  md: { minHeight: BUTTON_H.md, paddingHorizontal: spacing.xl },
  sm: { minHeight: BUTTON_H.sm, paddingHorizontal: spacing.lg },
  hug: { alignSelf: 'flex-start' },
  flex: { flex: 1 },
  primary: { backgroundColor: colors.accentFill },
  secondary: { backgroundColor: colors.surfaceSunken },
  ink: { backgroundColor: colors.textPrimary },
  danger: { backgroundColor: colors.surfaceSunken },
  off: { opacity: 0.45 },
  inner: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs },
  label: { fontFamily: fontFamily.sansBold, fontSize: fontSize.sm },
  link: { minHeight: 32, justifyContent: 'center' },
  linkText: { fontFamily: fontFamily.sansMedium, fontSize: fontSize.sm, color: colors.textPrimary },
  linkQuiet: { color: colors.textMuted },
  linkAccent: { color: colors.accentText },
  linkDanger: { color: colors.danger },
});
