/**
 * Icons for the import sources (onboarding's switching-apps branch, the
 * Finishing touches import sheet and Settings › Connections): the RN
 * counterpart of apps/web/src/components/ImportSourceIcon.jsx. The streaming
 * services use their real logos from TMDB's watch-provider list, found by
 * name at runtime (never a hard-coded id). Trakt's logo is a bundled file.
 * Letterboxd, Simkl, TV Time and IMDb aren't streaming providers, so they are
 * simple marks in their brand colours; those literals are brand colours, not
 * theme colours.
 */
import { useEffect, useState } from 'react';
import { Image, Text, View } from 'react-native';
import Svg, { Circle, Rect } from 'react-native-svg';
import { tmdb } from '../lib/tmdb';
import { fontFamily, logoUrl } from '../lib/tokens';
import { useTheme } from '../contexts/ThemeContext';

// TMDB's provider names drift (Max was HBO Max); the first name found wins.
const TMDB_NAMES: Record<string, string[]> = {
  netflix: ['Netflix'], plex: ['Plex'], prime: ['Amazon Prime Video', 'Amazon Video'], disney: ['Disney Plus', 'Disney+'],
  max: ['Max', 'HBO Max'], apple: ['Apple TV+', 'Apple TV Plus', 'Apple TV'],
};

let providerLogos: Promise<Record<string, string>> | null = null;
function loadProviderLogos() {
  if (!providerLogos) {
    providerLogos = Promise.all([tmdb.getWatchProvidersForRegion('movie', 'US'), tmdb.getWatchProvidersForRegion('tv', 'US')])
      .then(results => {
        const byName: Record<string, string> = {};
        for (const data of results) {
          for (const p of data?.results || []) if (p.provider_name && p.logo_path && !byName[p.provider_name]) byName[p.provider_name] = p.logo_path;
        }
        return byName;
      })
      .catch(() => ({} as Record<string, string>));
  }
  return providerLogos;
}

function useProviderLogo(id: string) {
  const names = TMDB_NAMES[id];
  const [path, setPath] = useState<string | null>(null);
  useEffect(() => {
    if (!names) return undefined;
    let alive = true;
    loadProviderLogos().then(byName => { if (alive) setPath(names.map(name => byName[name]).find(Boolean) || null); });
    return () => { alive = false; };
  }, [names]);
  return path;
}

/* Simple marks in brand colours for the sources TMDB has no logo for. */
function Mark({ size, bg, fg, text, scale = 0.38 }: { size: number; bg: string; fg: string; text: string; scale?: number }) {
  return (
    <View style={{ width: size, height: size, borderRadius: Math.round(size * 0.22), backgroundColor: bg, alignItems: 'center', justifyContent: 'center' }} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
      <Text style={{ fontFamily: fontFamily.display, fontSize: Math.round(size * scale), letterSpacing: -0.5, color: fg }}>{text}</Text>
    </View>
  );
}

export default function ImportSourceIcon({ id, name, size = 36 }: { id: string; name?: string; size?: number }) {
  const { colors } = useTheme();
  const logo = useProviderLogo(id);
  const radius = Math.round(size * 0.22);
  if (id === 'letterboxd') {
    return (
      <Svg width={size} height={size} viewBox="0 0 36 36">
        <Rect width={36} height={36} rx={8} fill="#14181C" />
        <Circle cx={11} cy={18} r={5.5} fill="#FF8000" />
        <Circle cx={18} cy={18} r={5.5} fill="#00E054" fillOpacity={0.92} />
        <Circle cx={25} cy={18} r={5.5} fill="#40BCF4" fillOpacity={0.92} />
      </Svg>
    );
  }
  if (id === 'simkl') return <Mark size={size} bg="#000000" fg="#FFFFFF" text="S" />;
  if (id === 'tvtime') return <Mark size={size} bg="#FFD600" fg="#111111" text="tv" scale={0.42} />;
  if (id === 'imdb') return <Mark size={size} bg="#F5C518" fg="#111111" text="IMDb" scale={0.26} />;
  if (id === 'trakt') {
    return <Image source={require('../assets/import-logos/trakt.png')} style={{ width: size, height: size, borderRadius: radius }} />;
  }
  const uri = logoUrl(logo, 'w92');
  if (uri) return <Image source={{ uri }} style={{ width: size, height: size, borderRadius: radius }} />;
  return (
    <View style={{ width: size, height: size, borderRadius: radius, backgroundColor: colors.surfaceSunken, alignItems: 'center', justifyContent: 'center' }}>
      <Text style={{ fontFamily: fontFamily.display, fontSize: Math.round(size * 0.42), color: colors.textPrimary }}>{(name || id)[0]?.toUpperCase()}</Text>
    </View>
  );
}
