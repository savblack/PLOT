/**
 * The round floating entry to Just Decide: bottom right, above the glass tab
 * bar. A disc in the brand fill (pink on the default theme, the theme's own
 * accent under a Premium theme) with the sparkle in the charcoal that sits on
 * that fill everywhere else. No halo: the design system rules out decorative
 * glows, so the disc is flat with only the legibility shadow the tab bar has.
 * It eases in on mount and presses down under the finger; nothing loops. Home
 * is the only screen that shows it.
 */
import { useEffect, useMemo, useState } from 'react';
import { Animated, Easing, Pressable, StyleSheet } from 'react-native';
import { useRouter, type Href } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Svg, { Path } from 'react-native-svg';
import { DISCOVER_VIEW } from '@plot/core/copy/discoverView.js';
import { useTheme } from '../contexts/ThemeContext';
import { Palette, spacing } from '../lib/tokens';
import { TAB_BAR_HEIGHT, tabBarBottom } from '../lib/tabBar';

const SIZE = 52;

function Sparkle({ color }: { color: string }) {
  return (
    // The pair is centered in the disc as one unit, so the large star sits
    // right of the middle and the small one left of it. Side to side that is
    // the middle of the pair's bounding box (x 1.75 to 18.5 on the 24 grid,
    // so 10.125). Top to bottom the box's middle (11.75) leaves the large
    // star reading high, and the pair's center of mass (10.75) leaves the
    // pair low, so it sits between the two at 11.25. The viewBox is a square
    // around that point, wide enough that no tip is clipped.
    <Svg width={25} height={25} viewBox="-0.375 0.75 21 21" fill={color}>
      <Path d="M12 2.5c.5 3.9 2.6 6 6.5 6.5-3.9.5-6 2.6-6.5 6.5-.5-3.9-2.6-6-6.5-6.5 3.9-.5 6-2.6 6.5-6.5z" />
      <Path d="M5 14.5c.25 1.9 1.35 3 3.25 3.25-1.9.25-3 1.35-3.25 3.25-.25-1.9-1.35-3-3.25-3.25 1.9-.25 3-1.35 3.25-3.25z" />
    </Svg>
  );
}

export default function TonightFab() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const [scale] = useState(() => new Animated.Value(0.6));
  const [press] = useState(() => new Animated.Value(1));

  useEffect(() => {
    Animated.spring(scale, { toValue: 1, friction: 6, tension: 80, useNativeDriver: true }).start();
  }, [scale]);

  const bottom = tabBarBottom(insets.bottom) + TAB_BAR_HEIGHT + spacing.md;
  return (
    <Animated.View pointerEvents="box-none" style={[styles.wrap, { bottom, transform: [{ scale: Animated.multiply(scale, press) }] }]}>
      <Pressable
        onPress={() => router.push('/(app)/tonight' as Href)}
        onPressIn={() => Animated.timing(press, { toValue: 0.92, duration: 90, easing: Easing.out(Easing.quad), useNativeDriver: true }).start()}
        onPressOut={() => Animated.timing(press, { toValue: 1, duration: 140, easing: Easing.out(Easing.quad), useNativeDriver: true }).start()}
        accessibilityRole="button"
        accessibilityLabel={DISCOVER_VIEW.tonightFab}
        style={styles.button}
      >
        <Sparkle color={colors.onAccentFill} />
      </Pressable>
    </Animated.View>
  );
}

const makeStyles = (colors: Palette) => StyleSheet.create({
  wrap: { position: 'absolute', right: spacing.xl },
  button: {
    width: SIZE,
    height: SIZE,
    borderRadius: SIZE / 2,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.accentFill,
    // Legibility against whatever scrolls underneath, as the tab bar.
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.18,
    shadowRadius: 14,
    elevation: 6,
  },
});
