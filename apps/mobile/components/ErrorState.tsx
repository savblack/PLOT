import { useMemo } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { useTheme } from '../contexts/ThemeContext';
import { Palette, fontFamily, fontSize, spacing } from '../lib/tokens';
import RetryButton from './RetryButton';

// Shared full-screen error state for screens whose bootstrap data load can
// fail (network/Supabase/TMDB errors) — mirrors the inline error+retry
// pattern already used in MediaPanel.
export default function ErrorState({
  message = "Couldn't load this. Check your connection.",
  onRetry,
}: {
  message?: string;
  onRetry: () => void;
}) {
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);

  return (
    <View style={styles.wrap}>
      <Text style={styles.text}>{message}</Text>
      <RetryButton onPress={onRetry} accessibilityLabel="Retry" accessibilityRole="button" />
    </View>
  );
}

const makeStyles = (colors: Palette) => StyleSheet.create({
  wrap: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: spacing.xl },
  text: { fontFamily: fontFamily.sans, fontSize: fontSize.sm, color: colors.textMuted, textAlign: 'center', marginBottom: spacing.md },
});
