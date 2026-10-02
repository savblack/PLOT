import { View, StyleSheet } from 'react-native';
import { familySwatch, type ThemeFamily } from '@plot/core/themes.js';
import { useTheme } from '../contexts/ThemeContext';

/**
 * Family chip: the light ground, a hairline, and a 3px accent-fill ring inside
 * it. Selection is a 2px ring in the current accent with a 2px gap. The
 * unselected ring is transparent so the chip does not shift.
 */
export default function ThemeChip({ family, selected = false }: { family: ThemeFamily; selected?: boolean }) {
  const { light } = familySwatch(family);
  const { colors } = useTheme();
  return (
    <View style={[styles.wrap, { borderColor: selected ? colors.accent : 'transparent' }]} accessibilityElementsHidden>
      <View style={[styles.face, { backgroundColor: light.bg, borderColor: colors.borderStrong }]}>
        <View style={[styles.ring, { borderColor: light.fill }]} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    padding: 2,
    borderWidth: 2,
    borderRadius: 999,
  },
  face: {
    width: 28,
    height: 28,
    borderRadius: 14,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  ring: {
    width: 22,
    height: 22,
    borderRadius: 11,
    borderWidth: 3,
  },
});
