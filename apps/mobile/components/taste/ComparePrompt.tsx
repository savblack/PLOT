// The way into Compare from another screen: a line on what it is and one
// button. Shared by History and Watch Together so both carry the same card.
// Web's twin is apps/web/src/components/CompareTasteCard.jsx; the words are
// TASTE_OVERLAP in @plot/core/copy.
import { useMemo } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { useRouter, type Href } from 'expo-router';
import { TASTE_OVERLAP } from '@plot/core/copy/tasteOverlap.js';
import Button from '../Button';
import { useTheme } from '../../contexts/ThemeContext';
import { Palette, fontFamily, fontSize, spacing, radii } from '../../lib/tokens';

export default function ComparePrompt() {
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const router = useRouter();
  return (
    <View style={styles.prompt}>
      <Text style={styles.promptTitle}>{TASTE_OVERLAP.historyPromptTitle}</Text>
      <Text style={styles.promptBody}>{TASTE_OVERLAP.historyPromptBody}</Text>
      <Button variant="outline" size="sm" label={TASTE_OVERLAP.compareTaste} onPress={() => router.push('/(app)/compare' as Href)} />
    </View>
  );
}

const makeStyles = (colors: Palette) => StyleSheet.create({
  prompt: {
    marginHorizontal: spacing.xl,
    marginTop: spacing.md,
    marginBottom: spacing.lg,
    padding: spacing.lg,
    borderRadius: radii.lg,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    gap: spacing.sm,
  },
  promptTitle: { fontFamily: fontFamily.sansBold, fontSize: fontSize.sm, color: colors.textSecondary },
  promptBody: { fontFamily: fontFamily.sans, fontSize: fontSize.sm, lineHeight: 20, color: colors.textMuted },
});
