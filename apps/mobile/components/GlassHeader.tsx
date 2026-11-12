/**
 * The fixed top bar every main screen shares (Home, My Lists and History,
 * Calendar, Settings). At the top of the page it is the page's own colour,
 * with no line under it, so the bar and the page read as one surface. Once
 * the page scrolls, frosted glass and the hairline fade in, so content
 * passing underneath stays legible (Savannah, 12 Nov 2026).
 *
 *   const glass = useGlassOnScroll();
 *   <ScrollView onScroll={glass.onScroll} scrollEventThrottle={16}>…
 *   <GlassHeader scrollY={glass.scrollY} height={HEADER_H}>…bar…</GlassHeader>
 *
 * A screen with its own scroll handler calls `glass.onScroll(e)` from it.
 */
import { useMemo, useState, type ReactNode } from 'react';
import { Animated, StyleSheet, View, type NativeScrollEvent, type NativeSyntheticEvent } from 'react-native';
import { BlurView } from 'expo-blur';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '../contexts/ThemeContext';
import type { Palette } from '../lib/tokens';

/** How far the page scrolls before the glass is fully in. */
const GLASS_IN = 16;

export function useGlassOnScroll() {
  const [scrollY] = useState(() => new Animated.Value(0));
  return useMemo(() => ({
    scrollY,
    onScroll: (e: NativeSyntheticEvent<NativeScrollEvent>) => scrollY.setValue(e.nativeEvent.contentOffset.y),
  }), [scrollY]);
}

export default function GlassHeader({ scrollY, height, children }: {
  scrollY: Animated.Value;
  /** The bar's full height, status bar included. */
  height: number;
  children: ReactNode;
}) {
  const { colors, resolved } = useTheme();
  const insets = useSafeAreaInsets();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const glass = scrollY.interpolate({ inputRange: [0, GLASS_IN], outputRange: [0, 1], extrapolate: 'clamp' });
  return (
    <View style={[styles.bar, { height, paddingTop: insets.top }]}>
      <Animated.View style={[StyleSheet.absoluteFill, styles.glass, { opacity: glass }]} pointerEvents="none">
        <BlurView
          intensity={80}
          tint={resolved === 'dark' ? 'systemChromeMaterialDark' : 'systemChromeMaterialLight'}
          style={StyleSheet.absoluteFill}
        />
      </Animated.View>
      {children}
    </View>
  );
}

const makeStyles = (colors: Palette) => StyleSheet.create({
  bar: { position: 'absolute', top: 0, left: 0, right: 0, zIndex: 100, flexDirection: 'column', backgroundColor: 'transparent' },
  glass: { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border },
});
