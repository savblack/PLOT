import { useEffect, useMemo, useRef } from 'react';
import { View, Animated, StyleSheet, Easing } from 'react-native';
import Svg, { Path } from 'react-native-svg';
import { WORDMARK_INK_HEIGHT, WORDMARK_LETTERS, WORDMARK_TOP } from '../core/wordmark.js';

// The wordmark loader: the plot wordmark outlines (l joined to the o), each
// letter rising into place in sequence, with a thin bar sweeping underneath.
// Mirrors PlotLoader.jsx; colours are passed in so it works from any screen.
const WORD_SIZE = 40; // the font size the live word used to be set at
const UNIT = WORD_SIZE / 1000;
const CYCLE = 1800;
const EASE = Easing.bezier(0.23, 1, 0.32, 1);

function RiseLetter({ index, delay, color }: { index: number; delay: number; color: string }) {
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
  const { path, x0, x1 } = WORDMARK_LETTERS[index];
  const width = x1 - x0;
  const overlap = index ? WORDMARK_LETTERS[index - 1].x1 - x0 : 0;
  return (
    <Animated.View style={{ marginLeft: -overlap * UNIT, opacity, transform: [{ translateY }] }}>
      <Svg width={width * UNIT} height={WORDMARK_INK_HEIGHT * UNIT} viewBox={`${x0} ${WORDMARK_TOP} ${width} ${WORDMARK_INK_HEIGHT}`}>
        <Path d={path} fill={color} />
      </Svg>
    </Animated.View>
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
        {WORDMARK_LETTERS.map(({ letter }, i) => (
          <RiseLetter key={letter} index={i} delay={i * 90} color={color} />
        ))}
      </View>
      <SweepBar color={fillColor} />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  word: { flexDirection: 'row', width: BAR_W, justifyContent: 'center', alignItems: 'flex-end' },
  bar: { width: BAR_W, height: 5, borderRadius: 3, marginTop: 10 },
});
