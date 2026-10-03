import { ReactNode } from 'react';
import Svg, { Circle, Line, Path, Polyline, Rect } from 'react-native-svg';

/* Same strokes as apps/web/src/components/navIcons.jsx, drawn at the drawer
   size (18px, stroke 1.7). Follow requests reuses the two-person mark already
   on the Settings row for that destination. */

export type NavIconName =
  | 'home'
  | 'search'
  | 'calendar'
  | 'lists'
  | 'tonight'
  | 'settings'
  | 'feedback'
  | 'support'
  | 'requests'
  | 'notifications'
  | 'together';

function Glyph({ color, children }: { color: string; children: ReactNode }) {
  return (
    <Svg
      width={18}
      height={18}
      viewBox="0 0 24 24"
      fill="none"
      stroke={color}
      strokeWidth={1.7}
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      {children}
    </Svg>
  );
}

export default function NavGlyph({ name, color }: { name: NavIconName; color: string }) {
  switch (name) {
    case 'home':
      return (
        <Glyph color={color}>
          <Path d="M3 9l9-7 9 7v11a2 2 0 01-2 2H5a2 2 0 01-2-2z" />
          <Polyline points="9,22 9,12 15,12 15,22" />
        </Glyph>
      );
    case 'search':
      return (
        <Glyph color={color}>
          <Circle cx={11} cy={11} r={7} />
          <Line x1={16.5} y1={16.5} x2={21} y2={21} />
        </Glyph>
      );
    case 'calendar':
      return (
        <Glyph color={color}>
          <Rect x={3} y={4} width={18} height={18} rx={2} ry={2} />
          <Line x1={16} y1={2} x2={16} y2={6} />
          <Line x1={8} y1={2} x2={8} y2={6} />
          <Line x1={3} y1={10} x2={21} y2={10} />
        </Glyph>
      );
    case 'lists':
      return (
        <Glyph color={color}>
          <Path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z" />
        </Glyph>
      );
    case 'tonight':
      return (
        <Glyph color={color}>
          <Path d="M3 6h10M3 12h7M3 18h7" />
          <Path d="m18 11 1.4 2.9 3.1.4-2.3 2.2.6 3.1-2.8-1.5-2.8 1.5.6-3.1-2.3-2.2 3.1-.4Z" />
        </Glyph>
      );
    case 'settings':
      return (
        <Glyph color={color}>
          <Circle cx={12} cy={12} r={3} />
          <Path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
        </Glyph>
      );
    case 'feedback':
      return (
        <Glyph color={color}>
          <Path d="M21 14a3 3 0 0 1-3 3H8l-5 4V6a3 3 0 0 1 3-3h12a3 3 0 0 1 3 3Z" />
          <Path d="M12 7.5v6M9 10.5h6" />
        </Glyph>
      );
    case 'support':
      return (
        <Glyph color={color}>
          <Path d="M20.8 5.6a5.4 5.4 0 0 0-7.7 0L12 6.7l-1.1-1.1a5.4 5.4 0 1 0-7.7 7.7l8.8 8.7 8.8-8.7a5.4 5.4 0 0 0 0-7.7Z" />
        </Glyph>
      );
    case 'requests':
      return (
        <Glyph color={color}>
          <Path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
          <Circle cx={9} cy={7} r={4} />
          <Path d="M22 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75" />
        </Glyph>
      );
    case 'notifications':
      return (
        <Glyph color={color}>
          <Path d="M18 8a6 6 0 0 0-12 0c0 7-3 9-3 9h18s-3-2-3-9" />
          <Path d="M13.73 21a2 2 0 0 1-3.46 0" />
        </Glyph>
      );
    case 'together':
      return (
        <Glyph color={color}>
          <Path d="M5 11V8a3 3 0 0 1 3-3h8a3 3 0 0 1 3 3v3" />
          <Path d="M3 13a2 2 0 0 1 4 0v1h10v-1a2 2 0 0 1 4 0v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
          <Path d="M6 19v2" />
          <Path d="M18 19v2" />
        </Glyph>
      );
  }
}
