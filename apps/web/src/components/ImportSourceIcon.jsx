// Icons for the import sources (onboarding's switching-apps step and the
// Finishing touches import sheet). Netflix and Plex use their real logos from
// TMDB's watch-provider list, found by name at runtime (never a hard-coded id).
// Letterboxd and Trakt aren't streaming providers, so they are simple marks in
// their brand colours; the colour literals are brand colours, not theme colours.
import { useEffect, useState } from 'react';
import { tmdb } from '@plot/core/tmdb.js';
import { logoUrl } from '../utils/images.js';

const TMDB_NAMES = { netflix: 'Netflix', plex: 'Plex' };

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
  const name = TMDB_NAMES[id];
  const [path, setPath] = useState(null);
  useEffect(() => {
    if (!name) return;
    let alive = true;
    loadProviderLogos().then(byName => { if (alive) setPath(byName[name] || null); });
    return () => { alive = false; };
  }, [name]);
  return path;
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

function TraktMark({ size }) {
  return (
    <svg width={size} height={size} viewBox="0 0 36 36" aria-hidden="true">
      <rect width="36" height="36" rx="8" fill="#ED1C24" />
      <circle cx="18" cy="18" r="10" fill="none" stroke="#FFFFFF" strokeWidth="2.4" />
      <path d="M13.5 18.2l3.2 3.2 6-6.4" fill="none" stroke="#FFFFFF" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

/** @param {{ id: 'letterboxd' | 'trakt' | 'netflix' | 'plex', name: string, size?: number }} props */
export default function ImportSourceIcon({ id, name, size = 36 }) {
  const logo = useProviderLogo(id);
  const radius = Math.round(size * 0.22);
  if (id === 'letterboxd') return <LetterboxdMark size={size} />;
  if (id === 'trakt') return <TraktMark size={size} />;
  if (logo) {
    return <img src={logoUrl(logo, 'w92')} alt="" width={size} height={size} style={{ width: size, height: size, borderRadius: radius, objectFit: 'cover', flexShrink: 0, display: 'block' }} />;
  }
  return (
    <span aria-hidden="true" style={{ width: size, height: size, borderRadius: radius, background: 'var(--surface-sunken)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: 'var(--font-display)', fontSize: Math.round(size * 0.42), flexShrink: 0 }}>
      {name[0]}
    </span>
  );
}
