/**
 * The round floating entry to Pick for Me: bottom right, above the glass tab
 * bar, a sparkle on the brand fill with a soft ring. It eases in on mount and
 * presses down under the finger; nothing loops. Home is the only screen that
 * shows it.
 */
import { useEffect, useMemo, useState } from 'react';
import { Animated, Easing, Pressable, StyleSheet, View } from 'react-native';
import { useRouter, type Href } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Svg, { Path } from 'react-native-svg';
import { DISCOVER_VIEW } from '@plot/core/copy/discoverView.js';
import { useTheme } from '../contexts/ThemeContext';
import { Palette, spacing } from '../lib/tokens';
import { TAB_BAR_HEIGHT, tabBarBottom } from '../lib/tabBar';

const SIZE = 56;

function Sparkle({ color }: { color: string }) {
  return (
    <Svg width={26} height={26} viewBox="0 0 24 24" fill={color}>
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
        <View style={styles.ring} pointerEvents="none" />
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
  // A soft halo in the same fill, a step outside the disc.
  ring: {
    position: 'absolute',
    width: SIZE + 12,
    height: SIZE + 12,
    borderRadius: (SIZE + 12) / 2,
    backgroundColor: colors.accentDim,
  },
});
