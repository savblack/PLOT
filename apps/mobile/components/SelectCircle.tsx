/**
 * Selection circle overlaid on a card while a section is in multi-select edit
 * mode — the RN counterpart of web's SelectCircle in MyListsView.jsx and its
 * `.select-circle` rules in styles/app.css.
 *
 * Two variants, matching web: `grid` sits on a poster tile, `row` on the small
 * thumbnail of a list row and is correspondingly smaller. Both keep a dark
 * translucent fill when unselected so the ring stays legible over pale posters.
 */
import { useMemo } from 'react';
import { TouchableOpacity, StyleSheet } from 'react-native';
import Svg, { Polyline } from 'react-native-svg';
import { useTheme } from '../contexts/ThemeContext';
import { Palette } from '../lib/tokens';

export default function SelectCircle({
  selected, variant = 'grid', onPress, label,
}: {
  selected: boolean;
  variant?: 'grid' | 'row';
  onPress: () => void;
  label: string;
}) {
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const size = variant === 'grid' ? 22 : 16;

  return (
    <TouchableOpacity
      style={[styles.circle, styles[variant], selected && styles[`${variant}Selected`]]}
      onPress={onPress}
      hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
      accessibilityRole="checkbox"
      accessibilityState={{ checked: selected }}
      accessibilityLabel={label}
    >
      {selected && (
        <Svg
          width={size * 0.6} height={size * 0.6} viewBox="0 0 24 24" fill="none"
          stroke="#fff" strokeWidth={3} strokeLinecap="round" strokeLinejoin="round"
        >
          <Polyline points="20,6 9,17 4,12" />
        </Svg>
      )}
    </TouchableOpacity>
  );
}

const makeStyles = (colors: Palette) => StyleSheet.create({
  circle: {
    position: 'absolute',
    alignItems: 'center',
    justifyContent: 'center',
  },
  grid: {
    top: 4,
    right: 4,
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: 'rgba(0,0,0,0.55)',
    borderWidth: 2,
    borderColor: 'rgba(255,255,255,0.85)',
  },
  gridSelected: {
    backgroundColor: colors.accent,
    borderColor: colors.accent,
  },
  row: {
    top: 2,
    right: 2,
    width: 16,
    height: 16,
    borderRadius: 8,
    backgroundColor: 'rgba(0,0,0,0.45)',
    borderWidth: 2,
    borderColor: '#fff',
  },
  rowSelected: {
    backgroundColor: colors.accent,
    borderColor: '#fff',
  },
});
