import { useState, useEffect, useCallback } from 'react';
import { supabase } from './supabase.js';

/**
 * Read-only profile data for /u/:username.
 *
 * Resolves the handle via the `get_profile_card` RPC, which returns a minimal
 * header for public profiles (anyone) and private profiles (logged-in viewers
 * only), plus the viewer's `follow_status`. Content (watch count, recent
 * watches, lists) is loaded only when viewable — the profile is public, or the
 * viewer is an accepted follower. Otherwise `locked` is true (private + not
 * following) and the page shows the request-to-follow state.
 *
 * `profile: null` after loading means the handle didn't resolve (no such user,
 * or private and the viewer isn't logged in) → placeholder.
 */
export function usePublicProfile(username, viewerId = null) {
  const [loading, setLoading]       = useState(true);
  const [profile, setProfile]       = useState(null);
  const [watchCount, setWatchCount] = useState(0);
  const [avgRating, setAvgRating]   = useState(null);
  const [recent, setRecent]         = useState([]);
  const [topMovies, setTopMovies]   = useState([]);
  const [topTv, setTopTv]           = useState([]);
  const [favourites, setFavourites] = useState([]);

  const load = useCallback(async () => {
    const handle = (username || '').replace(/^@/, '').trim().toLowerCase();
    setLoading(true);
    setRecent([]); setTopMovies([]); setTopTv([]); setFavourites([]);
    setWatchCount(0); setAvgRating(null);

    if (!handle) { setProfile(null); setLoading(false); return; }

    const { data: rows } = await supabase.rpc('get_profile_card', { p_username: handle });
    const card = Array.isArray(rows) ? rows[0] : null;
    if (!card) { setProfile(null); setLoading(false); return; }
    setProfile(card);

    const isOwn = viewerId && card.id === viewerId;
    const viewable = card.is_public || card.follow_status === 'accepted' || isOwn;
    if (!viewable) { setLoading(false); return; }   // private + not following → locked

    const uid = card.id;
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

    setWatchCount(countRes.count || 0);
    setRecent(recentRes.data || []);
    const tops = topRes.data || [];
    setTopMovies(tops.filter(t => t.list_type === 'movies'));
    setTopTv(tops.filter(t => t.list_type === 'tv'));
    setFavourites(favRes.data || []);
    const rated = ratedRes.data || [];
    setAvgRating(rated.length ? Math.round((rated.reduce((s, r) => s + r.rating, 0) / rated.length) * 10) / 10 : null);
    setLoading(false);
  }, [username, viewerId]);

  useEffect(() => {
    let cancelled = false;
    (async () => { await load(); })().catch(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [load]);

  const locked = !!profile && !profile.is_public && profile.follow_status !== 'accepted'
    && !(viewerId && profile.id === viewerId);

  return { loading, profile, locked, watchCount, avgRating, recent, topMovies, topTv, favourites };
}
