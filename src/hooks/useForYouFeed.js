import { useState, useEffect } from 'react';
import { tmdb } from '../api/tmdb';
import { supabase } from '../api/supabase';
import { GENRES } from '../constants';

// Recency-weighted seed score
const seedScore = (item) => {
  const daysSince = (Date.now() - new Date(item.watched_at || 0)) / 86_400_000;
  const recency = Math.exp(-daysSince / 90); // 90-day half-life
  return (item.rating || 1) * (0.6 + 0.4 * recency);
};

// Quality score for sorting candidates
const qualityScore = (item, jitter = 0) =>
  item.vote_average * Math.log(item.vote_count + 1) + (Math.random() - 0.5) * jitter;

// Genre diversity: cap 8 items per genre, then flatten
const diversify = (items) => {
  const buckets = {};
  for (const item of items) {
    const g = item.genre_ids?.[0] ?? 0;
    if (!buckets[g]) buckets[g] = [];
    if (buckets[g].length < 8) buckets[g].push(item);
  }
  return Object.values(buckets).flat();
};

export function useForYouFeed({ watched, preferences, user, feedTab }) {
  const [forYouFeed, setForYouFeed] = useState([]);
  const [forYouPool, setForYouPool] = useState([]);
  const [followingFeed, setFollowingFeed] = useState([]);
  const [followingFeedLoaded, setFollowingFeedLoaded] = useState(false);
  const [moodFilter, setMoodFilter] = useState(null);
  const [dismissed, setDismissed] = useState(
    () => new Set(JSON.parse(localStorage.getItem('plot-dismissed') || '[]'))
  );

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
        .sort((a, b) => seedScore(b) - seedScore(a))
        .slice(0, 10);

      // If moodFilter set, prefer mood-matching seeds (still fall back if none match)
      const moodSeeds = moodFilter
        ? watched.filter(i => i.mood === moodFilter && i.rating)
                .sort((a, b) => seedScore(b) - seedScore(a))
                .slice(0, 10)
        : null;

      const finalSeeds = (moodSeeds?.length > 0 ? moodSeeds : seeds.length > 0 ? seeds : watched.slice(0, 5));

      if (finalSeeds.length === 0) {
        if (preferences.genres.length === 0) return;
        const movieIds = preferences.genres.map(k => GENRES.find(g => g.key === k)?.movieId).filter(Boolean);
        const tvIds    = preferences.genres.map(k => GENRES.find(g => g.key === k)?.tvId).filter(Boolean);
        const [movieData, tvData] = await Promise.all([
          tmdb.discoverTopRatedByGenres('movie', movieIds),
          tmdb.discoverTopRatedByGenres('tv', tvIds),
        ]);
        const combined = [
          ...(movieData?.results || []).map(i => ({ ...i, media_type: 'movie' })),
          ...(tvData?.results   || []).map(i => ({ ...i, media_type: 'tv' })),
        ].sort((a, b) => b.vote_average - a.vote_average).slice(0, 60);
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
      const pool = diversify(
        allRecs
          .flatMap(r => r?.results || [])
          .filter(r => !watchedIds.has(r.id) && !dismissed.has(r.id) && !seen.has(r.id) && seen.add(r.id))
          .sort((a, b) => qualityScore(b) - qualityScore(a))
          .slice(0, 80)
      );

      // Collaborative blend — intersperse up to 5 unseen following items
      if (followingFeed.length) {
        const networkItems = followingFeed
          .filter(i => !watchedIds.has(i.tmdb_id || i.id) && !dismissed.has(i.tmdb_id || i.id))
          .slice(0, 5)
          .map(i => ({ ...i, id: i.tmdb_id || i.id, fromNetwork: true }));
        networkItems.forEach((ni, idx) => pool.splice((idx + 1) * 8, 0, ni));
      }

      setForYouPool(pool);
      setForYouFeed(pool.slice(0, 40));
    };
    loadForYou();
  }, [watched, preferences.genres, moodFilter, dismissed.size]);

  const onDismiss = (id) => {
    setDismissed(prev => {
      const next = new Set(prev);
      next.add(id);
      localStorage.setItem('plot-dismissed', JSON.stringify([...next]));
      return next;
    });
    setForYouPool(prev => prev.filter(i => i.id !== id));
    setForYouFeed(prev => prev.filter(i => i.id !== id));
  };

  const refreshForYou = () => {
    if (!forYouPool.length) return;
    const reshuffled = [...forYouPool]
      .map(item => ({ item, score: qualityScore(item, 4) }))
      .sort((a, b) => b.score - a.score)
      .map(x => x.item)
      .slice(0, 40);
    setForYouFeed(reshuffled);
  };

  const userMoods = [...new Set(
    watched.filter(i => i.mood && i.rating).map(i => i.mood)
  )];

  return {
    forYouFeed, followingFeed, followingFeedLoaded, setFollowingFeedLoaded,
    refreshForYou, onDismiss, moodFilter, setMoodFilter, userMoods,
  };
}
