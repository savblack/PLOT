/**
 * The Upgrade to Premium button on mobile: starts Stripe checkout in the
 * browser, or joins the waitlist while checkout is closed (see
 * hooks/usePremiumCheckout.ts). An error shows under it.
 */
import { useMemo } from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useTheme } from '../contexts/ThemeContext';
import usePremiumCheckout from '../hooks/usePremiumCheckout';
import { Palette, fontFamily, fontSize, radii, spacing } from '../lib/tokens';

export default function PremiumPurchaseButton() {
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const checkout = usePremiumCheckout();
  return (
    <View style={styles.wrap}>
      <TouchableOpacity style={[styles.primary, checkout.busy && styles.busy]} onPress={() => { void checkout.act(); }} disabled={checkout.busy} accessibilityRole="button">
        <Text style={styles.primaryText}>{checkout.label}</Text>
      </TouchableOpacity>
      {checkout.error ? <Text style={styles.note} accessibilityRole="alert">{checkout.error}</Text> : null}
    </View>
  );
}

const makeStyles = (colors: Palette) => StyleSheet.create({
  wrap: { gap: spacing.sm },
  primary: { alignSelf: 'flex-start', minHeight: 44, justifyContent: 'center', paddingHorizontal: spacing.xl, borderRadius: 999, backgroundColor: colors.accentFill },
  busy: { opacity: 0.6 },
  primaryText: { fontFamily: fontFamily.sansBold, fontSize: fontSize.md, color: colors.onAccentFill },
  note: { padding: spacing.md, borderRadius: radii.md, backgroundColor: colors.surfaceSunken, fontFamily: fontFamily.sans, fontSize: fontSize.sm, lineHeight: 20, color: colors.textPrimary },
});
