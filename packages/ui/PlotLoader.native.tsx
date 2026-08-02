import { useEffect, useMemo, useRef } from 'react';
import { View, Text, Animated, StyleSheet } from 'react-native';

const LETTERS = ['P', 'L', 'O', 'T'];

function PulseLetter({ letter, delay, color }: { letter: string; delay: number; color: string }) {
  const opacity = useRef(new Animated.Value(0.18)).current;

  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.delay(delay),
        Animated.timing(opacity, {
          toValue: 1,
          duration: 300,
          useNativeDriver: true,
        }),
        Animated.timing(opacity, {
          toValue: 0.18,
          duration: 900,
          useNativeDriver: true,
        }),
        Animated.delay(Math.max(0, 2000 - delay - 1200)),
      ])
    );
    loop.start();
    return () => loop.stop();
  }, []);

  return (
    <Animated.Text style={[styles.letter, { color, opacity }]}>
      {letter}
    </Animated.Text>
  );
}

/**
 * Full-screen wordmark loader. Takes plain color values rather than a theme
 * hook so it stays usable from any app — pass the caller's own resolved
 * `colors.bg` / `colors.textPrimary`.
 */
export default function PlotLoader({
  backgroundColor = '#0c0c0c',
  color = '#f0efe8',
}: {
  backgroundColor?: string;
  color?: string;
}) {
  const containerStyle = useMemo(
    () => [styles.container, { backgroundColor }],
    [backgroundColor]
  );
  return (
    <View style={containerStyle}>
      <View style={styles.row}>
        {LETTERS.map((letter, i) => (
          <PulseLetter key={letter} letter={letter} delay={i * 300} color={color} />
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  row: {
    flexDirection: 'row',
  },
  letter: {
    fontFamily: 'InstrumentSerif-Regular',
    fontSize: 40,
    letterSpacing: -1,
  },
});
