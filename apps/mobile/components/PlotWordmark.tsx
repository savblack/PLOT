import Svg, { Path } from 'react-native-svg';
import type { StyleProp, ViewStyle } from 'react-native';
import { WORDMARK_EM, WORDMARK_PATH, WORDMARK_VIEWBOX } from '@plot/core/wordmark.js';

/**
 * The plot wordmark: lowercase Gabarito Bold outlines with the l's foot joined
 * to the o. It's vector paths, not a <Text>, because the font can't set the
 * join. `size` is the font size the word used to be set at, so swapping it in
 * for a Text keeps the same ink.
 */
export default function PlotWordmark({
  size,
  color,
  style,
  label = 'plot',
}: {
  size: number;
  color: string;
  style?: StyleProp<ViewStyle>;
  label?: string | null;
}) {
  return (
    <Svg
      width={size * WORDMARK_EM.width}
      height={size * WORDMARK_EM.height}
      viewBox={WORDMARK_VIEWBOX}
      style={style}
      accessible={!!label}
      accessibilityRole={label ? 'image' : undefined}
      accessibilityLabel={label ?? undefined}
    >
      <Path d={WORDMARK_PATH} fill={color} />
    </Svg>
  );
}
