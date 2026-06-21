import { useState, useEffect } from 'react';
import { supabase } from '../api/supabase.js';

/**
 * Read-only public profile data for /u/:username.
 * Resolves the handle against the `public_profiles` view (only opted-in profiles
 * are exposed) and then loads the publicly-readable content for that user id.
 *
 * Returns `profile: null` once loading finishes when the handle doesn't resolve
 * (no such user, or their profile is private) — the page renders its placeholder.
 */
export function usePublicProfile(username) {
  const [loading, setLoading]       = useState(true);
  const [profile, setProfile]       = useState(null);
  const [watchCount, setWatchCount] = useState(0);
  const [avgRating, setAvgRating]   = useState(null);
  const [recent, setRecent]         = useState([]);
  const [topMovies, setTopMovies]   = useState([]);
  const [topTv, setTopTv]           = useState([]);
  const [favourites, setFavourites] = useState([]);

  useEffect(() => {
    let cancelled = false;
    const handle = (username || '').replace(/^@/, '').trim().toLowerCase();

    async function load() {
      setLoading(true);
      const { data: prof } = await supabase
        .from('public_profiles')
        .select('id, username, display_name, avatar_url, is_supporter')
        .ilike('username', handle)
        .maybeSingle();

      if (cancelled) return;
      if (!prof) { setProfile(null); setLoading(false); return; }
      setProfile(prof);
      const uid = prof.id;

      const [countRes, recentRes, topRes, favRes, ratedRes] = await Promise.all([
        supabase.from('journal').select('id', { count: 'exact', head: true }).eq('user_id', uid),
        supabase.from('journal')
          .select('tmdb_id, media_type, title, poster_path, rating, watched_at')
          .eq('user_id', uid).order('watched_at', { ascending: false }).limit(18),
        supabase.from('user_top_lists')
          .select('list_type, rank, tmdb_id, media_type, title, poster_path')
          .eq('user_id', uid).order('rank', { ascending: true }),
        supabase.from('user_favourites')
          .select('tmdb_id, media_type, title, poster_path')
          .eq('user_id', uid).order('created_at', { ascending: false }).limit(18),
        supabase.from('journal').select('rating').eq('user_id', uid).not('rating', 'is', null),
      ]);

      if (cancelled) return;
      setWatchCount(countRes.count || 0);
      setRecent(recentRes.data || []);
      const tops = topRes.data || [];
      setTopMovies(tops.filter(t => t.list_type === 'movies'));
      setTopTv(tops.filter(t => t.list_type === 'tv'));
      setFavourites(favRes.data || []);
      const rated = ratedRes.data || [];
      setAvgRating(rated.length ? Math.round((rated.reduce((s, r) => s + r.rating, 0) / rated.length) * 10) / 10 : null);
      setLoading(false);
    }

    if (handle) load();
    else { setProfile(null); setLoading(false); }
    return () => { cancelled = true; };
  }, [username]);

  return { loading, profile, watchCount, avgRating, recent, topMovies, topTv, favourites };
}
