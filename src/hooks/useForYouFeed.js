import { useState, useEffect } from 'react';
import { tmdb } from '../api/tmdb';
import { supabase } from '../api/supabase';
import { GENRES } from '../constants';

export function useForYouFeed({ watched, preferences, user, feedTab }) {
  const [forYouFeed, setForYouFeed] = useState([]);
  const [followingFeed, setFollowingFeed] = useState([]);
  const [followingFeedLoaded, setFollowingFeedLoaded] = useState(false);

  // Load following feed lazily when tab is first activated
  useEffect(() => {
    if (feedTab !== 'following' || !user || followingFeedLoaded) return;
    const fetchFollowingFeed = async () => {
      const { data: followRows } = await supabase
        .from('follows').select('following_id').eq('follower_id', user.id);
      const ids = followRows?.map(r => r.following_id) ?? [];
      if (!ids.length) { setFollowingFeed([]); setFollowingFeedLoaded(true); return; }
      const [{ data: entries }, { data: profiles }] = await Promise.all([
        supabase.from('journal').select('*').in('user_id', ids).order('watched_at', { ascending: false }).limit(60),
        supabase.from('profiles').select('id, username, display_name').in('id', ids),
      ]);
      const profileMap = Object.fromEntries((profiles ?? []).map(p => [p.id, p]));
      setFollowingFeed((entries ?? []).map(e => ({ ...e, profile: profileMap[e.user_id] ?? null })));
      setFollowingFeedLoaded(true);
    };
    fetchFollowingFeed();
  }, [feedTab, user, followingFeedLoaded]);

  // For You feed — improves with every item the user logs
  useEffect(() => {
    const loadForYou = async () => {
      const watchedIds = new Set(watched.map(i => i.tmdb_id || i.id));

      const seeds = [...watched]
        .filter(i => i.rating)
        .sort((a, b) => b.rating - a.rating)
        .slice(0, 10);
      const finalSeeds = seeds.length > 0 ? seeds : watched.slice(0, 5);

      if (finalSeeds.length === 0) {
        if (preferences.genres.length === 0) return;
        const movieIds = preferences.genres.map(k => GENRES.find(g => g.key === k)?.movieId).filter(Boolean);
        const tvIds    = preferences.genres.map(k => GENRES.find(g => g.key === k)?.tvId).filter(Boolean);
        const [movieData, tvData] = await Promise.all([
          tmdb.discoverByGenres('movie', movieIds),
          tmdb.discoverByGenres('tv', tvIds),
        ]);
        const combined = [
          ...(movieData?.results || []).map(i => ({ ...i, media_type: 'movie' })),
          ...(tvData?.results   || []).map(i => ({ ...i, media_type: 'tv' })),
        ].sort((a, b) => b.popularity - a.popularity).slice(0, 60);
        if (combined.length > 0) setForYouFeed(combined);
        return;
      }

      const allRecs = await Promise.all(
        finalSeeds.map(item =>
          tmdb.getRecommendations(
            item.media_type || (item.title ? 'movie' : 'tv'),
            item.tmdb_id || item.id
          )
        )
      );

      const seen = new Set();
      const results = allRecs
        .flatMap(r => r?.results || [])
        .filter(r => {
          if (watchedIds.has(r.id) || seen.has(r.id)) return false;
          seen.add(r.id);
          return true;
        })
        .sort((a, b) =>
          (b.vote_average * Math.log(b.vote_count + 1)) -
          (a.vote_average * Math.log(a.vote_count + 1))
        )
        .slice(0, 40);

      if (results.length > 0) setForYouFeed(results);
    };
    loadForYou();
  }, [watched, preferences.genres]);

  return { forYouFeed, followingFeed, followingFeedLoaded, setFollowingFeedLoaded };
}
