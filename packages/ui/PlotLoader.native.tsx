import { useEffect, useMemo, useRef } from 'react';
import { View, Animated, StyleSheet, Easing } from 'react-native';

// The wordmark loader: the lowercase word in Gabarito, each letter rising into
// place in sequence, with a thin sage bar sweeping underneath. Mirrors
// PlotLoader.jsx; colours are passed in so it works from any screen.
const LETTERS = ['p', 'l', 'o', 't'];
const CYCLE = 1800;
const EASE = Easing.bezier(0.23, 1, 0.32, 1);

function RiseLetter({ letter, delay, color }: { letter: string; delay: number; color: string }) {
  const t = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.delay(delay),
        Animated.timing(t, { toValue: 1, duration: 400, easing: EASE, useNativeDriver: true }),
        Animated.delay(900),
        Animated.timing(t, { toValue: 2, duration: 320, easing: Easing.in(Easing.quad), useNativeDriver: true }),
        Animated.delay(Math.max(0, CYCLE - delay - 1620)),
        Animated.timing(t, { toValue: 0, duration: 0, useNativeDriver: true }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, []);
  const opacity = t.interpolate({ inputRange: [0, 1, 2], outputRange: [0, 1, 0] });
  const translateY = t.interpolate({ inputRange: [0, 1, 2], outputRange: [10, 0, -6] });
  return (
    <Animated.Text style={[styles.letter, { color, opacity, transform: [{ translateY }] }]}>{letter}</Animated.Text>
  );
}

function SweepBar({ color }: { color: string }) {
  const t = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.delay(450),
        Animated.timing(t, { toValue: 1, duration: 550, easing: EASE, useNativeDriver: true }),
        Animated.timing(t, { toValue: 2, duration: 450, easing: EASE, useNativeDriver: true }),
        Animated.delay(CYCLE - 1450),
        Animated.timing(t, { toValue: 0, duration: 0, useNativeDriver: true }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, []);
  // Grows from the left, then shrinks toward the right: scale about a moving origin.
  const scaleX = t.interpolate({ inputRange: [0, 1, 2], outputRange: [0.001, 1, 0.001] });
  const translateX = t.interpolate({ inputRange: [0, 1, 2], outputRange: [-BAR_W / 2, 0, BAR_W / 2] });
  return <Animated.View style={[styles.bar, { backgroundColor: color, transform: [{ translateX }, { scaleX }] }]} />;
}

const BAR_W = 92;

/**
 * Full-screen wordmark loader. Takes plain colour values rather than a theme
 * hook so it stays usable from any app — pass the caller's own resolved
 * colors.bg / colors.textPrimary / colors.accentFill.
 */
export default function PlotLoader({
  backgroundColor = '#f8f2ea',
  color = '#292924',
  fillColor = '#ff88c8',
}: {
  backgroundColor?: string;
  color?: string;
  fillColor?: string;
}) {
  const containerStyle = useMemo(() => [styles.container, { backgroundColor }], [backgroundColor]);
  return (
    <View style={containerStyle}>
      <View style={styles.word}>
        {LETTERS.map((letter, i) => (
          <RiseLetter key={letter} letter={letter} delay={i * 90} color={color} />
        ))}
      </View>
      <SweepBar color={fillColor} />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  word: { flexDirection: 'row', width: BAR_W, justifyContent: 'center' },
  letter: { fontFamily: 'Gabarito-Bold', fontSize: 40, letterSpacing: -1.8, lineHeight: 44 },
  bar: { width: BAR_W, height: 5, borderRadius: 3, marginTop: 10 },
});
