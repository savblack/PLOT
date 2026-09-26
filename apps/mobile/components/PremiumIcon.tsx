/**
 * Premium feature icons, keyed by the `icon` field on PLANS_PAGE.freeCard /
 * premiumCard rows. The RN counterpart of apps/web/src/components/PremiumIcon.jsx;
 * keep the two path sets identical.
 */
import type { ReactNode } from 'react';
import Svg, { Circle, Path, Rect } from 'react-native-svg';

const PATHS: Record<string, ReactNode> = {
  track: <><Path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12Z" /><Circle cx="12" cy="12" r="3" /></>,
  rate: <Path d="m12 3 2.7 5.6 6.1.9-4.4 4.3 1 6.1L12 17l-5.4 2.9 1-6.1-4.4-4.3 6.1-.9Z" />,
  lists: <Path d="M9 6h11M9 12h11M9 18h11M4 6h.01M4 12h.01M4 18h.01" />,
  discover: <><Circle cx="11" cy="11" r="7" /><Path d="m20 20-3.5-3.5" /></>,
  stats: <Path d="M4 20V10M10 20V4M16 20v-7M22 20H2" />,
  pick: <><Rect x="3" y="3" width="18" height="18" rx="4" /><Path d="M8 8h.01M16 16h.01M12 12h.01M16 8h.01M8 16h.01" /></>,
  together: <><Circle cx="9" cy="8" r="3.5" /><Path d="M2.5 20a6.5 6.5 0 0 1 13 0M16 4.5a3.5 3.5 0 0 1 0 7M18 14a6.5 6.5 0 0 1 3.5 6" /></>,
  sync: <Path d="M20 8a8 8 0 0 0-14.5-2M4 4v4h4M4 16a8 8 0 0 0 14.5 2M20 20v-4h-4" />,
  customise: <Path d="M12 3v4M12 17v4M3 12h4M17 12h4M6 6l2.5 2.5M15.5 15.5 18 18M6 18l2.5-2.5M15.5 8.5 18 6" />,
};

export default function PremiumIcon({ name, color, size = 16 }: { name: string; color: string; size?: number }) {
  const paths = PATHS[name];
  if (!paths) return null;
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
      {paths}
    </Svg>
  );
}
