// Icons for the import sources (onboarding's switching-apps step and the
// Finishing touches import sheet). Netflix and Plex use their real logos from
// TMDB's watch-provider list, found by name at runtime (never a hard-coded id).
// Trakt's logo is a file in public/import-logos. Letterboxd isn't a streaming
// provider either, so it is a simple mark in its brand colours; those colour
// literals are brand colours, not theme colours.
import { useEffect, useState } from 'react';
import { tmdb } from '@plot/core/tmdb.js';
import { logoUrl } from '../utils/images.js';

// TMDB's provider names drift (Max was HBO Max); the first name found wins.
const TMDB_NAMES = {
  netflix: ['Netflix'], plex: ['Plex'], prime: ['Amazon Prime Video', 'Amazon Video'], disney: ['Disney Plus', 'Disney+'],
  max: ['Max', 'HBO Max'], apple: ['Apple TV+', 'Apple TV Plus', 'Apple TV'],
};

let providerLogos = null;
function loadProviderLogos() {
  if (!providerLogos) {
    providerLogos = Promise.all([tmdb.getWatchProvidersForRegion('movie', 'US'), tmdb.getWatchProvidersForRegion('tv', 'US')])
      .then(results => {
        const byName = {};
        for (const data of results) {
          for (const p of data?.results || []) if (p.provider_name && p.logo_path && !byName[p.provider_name]) byName[p.provider_name] = p.logo_path;
        }
        return byName;
      })
      .catch(() => ({}));
  }
  return providerLogos;
}

function useProviderLogo(id) {
  const names = TMDB_NAMES[id];
  const [path, setPath] = useState(null);
  useEffect(() => {
    if (!names) return;
    let alive = true;
    loadProviderLogos().then(byName => { if (alive) setPath(names.map(name => byName[name]).find(Boolean) || null); });
    return () => { alive = false; };
  }, [names]);
  return path;
}

/* Simple marks in brand colours for the sources TMDB has no logo for. */
function Mark({ size, bg, fg, text, weight = 800, scale = 0.38 }) {
  return (
    <span aria-hidden="true" style={{ width: size, height: size, borderRadius: Math.round(size * 0.22), background: bg, color: fg, display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: 'var(--font-display)', fontWeight: weight, fontSize: Math.round(size * scale), letterSpacing: '-0.03em', flexShrink: 0 }}>
      {text}
    </span>
  );
}

function LetterboxdMark({ size }) {
  return (
    <svg width={size} height={size} viewBox="0 0 36 36" aria-hidden="true">
      <rect width="36" height="36" rx="8" fill="#14181C" />
      <circle cx="11" cy="18" r="5.5" fill="#FF8000" />
      <circle cx="18" cy="18" r="5.5" fill="#00E054" fillOpacity="0.92" />
      <circle cx="25" cy="18" r="5.5" fill="#40BCF4" fillOpacity="0.92" />
    </svg>
  );
}

/** @param {{ id: string, name: string, size?: number }} props */
export default function ImportSourceIcon({ id, name, size = 36 }) {
  const logo = useProviderLogo(id);
  const radius = Math.round(size * 0.22);
  if (id === 'letterboxd') return <LetterboxdMark size={size} />;
  if (id === 'simkl') return <Mark size={size} bg="#000000" fg="#FFFFFF" text="S" />;
  if (id === 'tvtime') return <Mark size={size} bg="#FFD600" fg="#111111" text="tv" scale={0.42} />;
  if (id === 'imdb') return <Mark size={size} bg="#F5C518" fg="#111111" text="IMDb" scale={0.26} />;
  if (id === 'trakt') return <img src="/import-logos/trakt.png" alt="" width={size} height={size} style={{ width: size, height: size, borderRadius: radius, flexShrink: 0, display: 'block' }} />;
  if (logo) {
    return <img src={logoUrl(logo, 'w92')} alt="" width={size} height={size} style={{ width: size, height: size, borderRadius: radius, objectFit: 'cover', flexShrink: 0, display: 'block' }} />;
  }
  return (
    <span aria-hidden="true" style={{ width: size, height: size, borderRadius: radius, background: 'var(--surface-sunken)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: 'var(--font-display)', fontSize: Math.round(size * 0.42), flexShrink: 0 }}>
      {name[0]}
    </span>
  );
}
