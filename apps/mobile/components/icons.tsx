/**
 * The small stroke glyphs the app draws in many places: search, chevrons,
 * close, check and plus. One copy of each path, so the same icon is the same
 * shape everywhere. Each site passes its own size, color and stroke width.
 * Tab-bar and drawer glyphs are a different set: see NavIcons.tsx.
 */
import { ReactNode } from 'react';
import { StyleProp, ViewStyle } from 'react-native';
import Svg, { Circle, Line, Path, Polyline } from 'react-native-svg';

export type IconProps = {
  size?: number;
  color: string;
  strokeWidth?: number;
  /** Passed to the Svg itself, for a rotation or a margin. */
  style?: StyleProp<ViewStyle>;
};

function Glyph({ size = 20, color, strokeWidth = 2, style, children }: IconProps & { children: ReactNode }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round" style={style}>
      {children}
    </Svg>
  );
}

export function IconSearch(props: IconProps) {
  return (
    <Glyph {...props}>
      <Circle cx={11} cy={11} r={7} />
      <Line x1={16.5} y1={16.5} x2={21} y2={21} />
    </Glyph>
  );
}

export function IconChevronLeft(props: IconProps) {
  return <Glyph {...props}><Path d="M15 18l-6-6 6-6" /></Glyph>;
}

export function IconChevronRight(props: IconProps) {
  return <Glyph {...props}><Polyline points="9,18 15,12 9,6" /></Glyph>;
}

export function IconChevronDown(props: IconProps) {
  return <Glyph {...props}><Polyline points="6,9 12,15 18,9" /></Glyph>;
}

export function IconChevronUp(props: IconProps) {
  return <Glyph {...props}><Polyline points="6,15 12,9 18,15" /></Glyph>;
}

export function IconClose(props: IconProps) {
  return <Glyph {...props}><Path d="M18 6L6 18M6 6l12 12" /></Glyph>;
}

export function IconCheck(props: IconProps) {
  return <Glyph {...props}><Polyline points="20 6 9 17 4 12" /></Glyph>;
}

export function IconPlus(props: IconProps) {
  return <Glyph {...props}><Path d="M12 5v14M5 12h14" /></Glyph>;
}
