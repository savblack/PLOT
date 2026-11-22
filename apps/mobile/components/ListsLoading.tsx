import { StyleSheet, View } from 'react-native';
import { COMMON } from '@plot/core/copy/common.js';
import { useTheme } from '../contexts/ThemeContext';
import { radii, spacing } from '../lib/tokens';

/**
 * My Lists while its data loads (Nov 19, as web's ListsLoading.jsx): the
 * screen's own shape in the deeper cream, a section heading over a poster
 * grid, instead of the full-screen loader. Static blocks, like Compare's
 * LoadingSkeleton, so there is no motion to switch off.
 */
export default function ListsLoading() {
  const { colors } = useTheme();
  const block = { backgroundColor: colors.surfaceSunken };
  return (
    <View
      accessibilityRole="progressbar"
      accessibilityLabel={COMMON.loading}
      style={[styles.screen, { backgroundColor: colors.bg }]}
    >
      {[0, 1].map(section => (
        <View key={section} style={styles.section}>
          <View style={[styles.heading, block]} />
          <View style={styles.grid}>
            {[0, 1, 2].map(i => (
              <View key={i} style={styles.card}>
                <View style={[styles.poster, block]} />
                <View style={[styles.line, block, { width: `${60 + ((i * 13) % 30)}%` }]} />
              </View>
            ))}
          </View>
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, paddingHorizontal: spacing.lg, paddingTop: spacing.lg, gap: spacing.xl },
  section: { gap: spacing.md },
  heading: { width: '40%', height: 14, borderRadius: radii.sm },
  grid: { flexDirection: 'row', gap: spacing.sm },
  card: { flex: 1, gap: spacing.sm },
  poster: { aspectRatio: 2 / 3, borderRadius: radii.md },
  line: { height: 10, borderRadius: radii.sm },
});
