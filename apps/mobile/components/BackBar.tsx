/**
 * The top row of a screen reached from another screen: a back chevron and the
 * screen's title. Shared so every such screen has the same bar; screens with
 * the app's full header (search, title, bell) use ScreenHeaderBar instead.
 */
import { useMemo } from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { useRouter } from 'expo-router';
import Svg, { Path } from 'react-native-svg';
import { useTheme } from '../contexts/ThemeContext';
import { Palette, fontFamily, fontSize, spacing } from '../lib/tokens';

/** `title` is optional: some screens carry their own large title under the bar. */
export default function BackBar({ title, onBack }: { title?: string; onBack?: () => void }) {
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const router = useRouter();
  return (
    <View style={styles.bar}>
      <TouchableOpacity onPress={onBack ?? (() => router.back())} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }} style={styles.back} accessibilityLabel="Go back" accessibilityRole="button">
        <Svg width={24} height={24} viewBox="0 0 24 24" fill="none" stroke={colors.textPrimary} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
          <Path d="M15 18l-6-6 6-6" />
        </Svg>
      </TouchableOpacity>
      {title ? <Text style={styles.title} accessibilityRole="header">{title}</Text> : null}
    </View>
  );
}

const makeStyles = (colors: Palette) => StyleSheet.create({
  bar: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: spacing.md, paddingVertical: spacing.sm, gap: spacing.sm },
  back: { padding: 4 },
  title: { fontFamily: fontFamily.sansMedium, fontSize: fontSize.md, color: colors.textPrimary },
});
