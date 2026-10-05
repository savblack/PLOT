/**
 * Icons for the import sources (onboarding's switching-apps branch and the
 * Finishing touches import sheet): the RN counterpart of
 * apps/web/src/components/ImportSourceIcon.jsx. Netflix and Plex use their real
 * logos from TMDB's watch-provider list, found by name at runtime (never a
 * hard-coded id). Trakt's logo is a bundled file. Letterboxd isn't a streaming
 * provider, so it is a simple mark in its brand colours; those literals are
 * brand colours, not theme colours.
 */
import { useEffect, useState } from 'react';
import { Image, Text, View } from 'react-native';
import Svg, { Circle, Rect } from 'react-native-svg';
import { tmdb } from '../lib/tmdb';
import { fontFamily, logoUrl } from '../lib/tokens';
import { useTheme } from '../contexts/ThemeContext';

const TMDB_NAMES: Record<string, string> = { netflix: 'Netflix', plex: 'Plex' };

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
  const name = TMDB_NAMES[id];
  const [path, setPath] = useState<string | null>(null);
  useEffect(() => {
    if (!name) return undefined;
    let alive = true;
    loadProviderLogos().then(byName => { if (alive) setPath(byName[name] || null); });
    return () => { alive = false; };
  }, [name]);
  return path;
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
