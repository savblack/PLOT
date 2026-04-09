import { useState, useEffect } from 'react';
import { tmdb } from '../api/tmdb';

export function useContentFeed(region) {
  const [trending, setTrending] = useState([]);
  const [newReleases, setNewReleases] = useState([]);
  const [newTV, setNewTV] = useState([]);
  const [streamingMovies, setStreamingMovies] = useState([]);
  const [streamingTV, setStreamingTV] = useState([]);
  const [upcoming, setUpcoming] = useState([]);
  const [upcomingTV, setUpcomingTV] = useState([]);

  useEffect(() => {
    const loadData = async () => {
      const [trendingMovies, nowPlayingData, upcomingData, tvOnAir, trendingTV, upcomingTVData] = await Promise.all([
        tmdb.getTrending('movie'),
        tmdb.getNowPlaying(),
        tmdb.getUpcoming(),
        tmdb.getTVOnTheAir(),
        tmdb.getTVTrending(),
        tmdb.getUpcomingTV(),
      ]);

      const enrichWithProviders = async (items, type) => {
        return Promise.all(items.map(async (item) => {
          try {
            const providers = await tmdb.getWatchProviders(item.id, type);
            const regionData = providers.results?.[region];
            const primaryProvider = regionData?.flatrate?.[0];
            return {
              ...item,
              media_type: type,
              provider: primaryProvider ? {
                name: primaryProvider.provider_name,
                logo: `https://image.tmdb.org/t/p/w92${primaryProvider.logo_path}`
              } : null
            };
          } catch {
            return { ...item, media_type: type };
          }
        }));
      };

      const today = new Date();
      today.setHours(0, 0, 0, 0);
      const isReleased = (item) => { const d = item.release_date || item.first_air_date; return d ? new Date(d) <= today : false; };
      const isFuture   = (item) => { const d = item.release_date || item.first_air_date; return d ? new Date(d) >  today : false; };
      const byDateAsc  = (a, b) => new Date(a.release_date || a.first_air_date) - new Date(b.release_date || b.first_air_date);

      if (trendingMovies && trendingTV) {
        const [enrichedMovies, enrichedTV] = await Promise.all([
          enrichWithProviders(trendingMovies.results ?? [], 'movie'),
          enrichWithProviders(trendingTV.results ?? [], 'tv'),
        ]);
        const seen = new Set();
        const deduped = [...enrichedMovies, ...enrichedTV].filter(item => {
          if (seen.has(item.id)) return false;
          seen.add(item.id);
          return true;
        });
        setTrending(deduped.sort(() => Math.random() - 0.5).slice(0, 120));
      }

      if (nowPlayingData) {
        const enriched = await enrichWithProviders(nowPlayingData.results.filter(isReleased).slice(0, 40), 'movie');
        setNewReleases(enriched);
      }

      if (upcomingData) setUpcoming(upcomingData.results.filter(isFuture).sort(byDateAsc).slice(0, 40));

      if (tvOnAir) {
        const enriched = await enrichWithProviders(tvOnAir.results.filter(isReleased).slice(0, 40), 'tv');
        setNewTV(enriched);
      }

      if (upcomingTVData) setUpcomingTV(upcomingTVData.results.filter(isFuture).sort(byDateAsc).slice(0, 40));

      const [streamingMovieData, streamingTVData] = await Promise.all([
        tmdb.getStreamingMovies(),
        tmdb.getStreamingTV(),
      ]);
      if (streamingMovieData) {
        const enriched = await enrichWithProviders(streamingMovieData.results.slice(0, 60), 'movie');
        setStreamingMovies(enriched);
      }
      if (streamingTVData) {
        const enriched = await enrichWithProviders(streamingTVData.results.slice(0, 60), 'tv');
        setStreamingTV(enriched);
      }
    };
    loadData();
  }, [region]);

  return { trending, newReleases, newTV, streamingMovies, streamingTV, upcoming, upcomingTV };
}
