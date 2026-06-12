import { useState, useEffect, useCallback } from 'react';
import { tmdb, getTmdbRegion } from '../api/tmdb.js';

export function useGuide(providers = []) {
  const [airingToday,    setAiringToday]    = useState([]);
  const [platformRails,  setPlatformRails]  = useState([]); // [{ provider, items }]
  const [newMovies,      setNewMovies]      = useState([]);
  const [loading,        setLoading]        = useState(true);

  const providerIds = providers.map(p => p.id);

  const load = useCallback(async () => {
    setLoading(true);
    const region = getTmdbRegion();

    // Fetch airing today + new movies in parallel
    const [todayRes, moviesRes] = await Promise.all([
      tmdb.getAiringToday(),
      tmdb.getNowPlaying(),
    ]);

    setAiringToday((todayRes?.results || []).slice(0, 20));
    setNewMovies((moviesRes?.results || []).slice(0, 20));

    // Fetch content for each provider rail
    if (providerIds.length > 0) {
      const rails = await Promise.all(
        providers.map(async (provider) => {
          const [tvRes, movRes] = await Promise.all([
            tmdb.discoverByProviders('tv', [provider.id], region),
            tmdb.discoverByProviders('movie', [provider.id], region),
          ]);
          const items = [
            ...(tvRes?.results    || []).map(i => ({ ...i, media_type: 'tv' })),
            ...(movRes?.results   || []).map(i => ({ ...i, media_type: 'movie' })),
          ]
            .sort((a, b) => b.popularity - a.popularity)
            .slice(0, 20);
          return { provider, items };
        })
      );
      setPlatformRails(rails.filter(r => r.items.length > 0));
    }

    setLoading(false);
  }, [JSON.stringify(providerIds)]); // eslint-disable-line

  // eslint-disable-next-line react-hooks/set-state-in-effect -- loading is delegated to the stable loader callback
  useEffect(() => { load(); }, [load]);

  return { airingToday, platformRails, newMovies, loading, reload: load };
}
