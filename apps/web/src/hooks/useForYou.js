import { useState, useEffect } from 'react';
import { supabase } from '../api/supabase.js';
import { tmdb } from '../api/tmdb.js';

// Reads the get_for_you() RPC (item-item collaborative filtering over the
// user's own watchlist/favourites/history, computed nightly in Postgres —
// see supabase/migrations/20260726020000_for_you_recommendations.sql) and
// hydrates each {tmdb_id, media_type} row with poster/title/date via TMDB.
// Returns [] for signed-out users or anyone TMDB can't resolve a row for.
// `enabled` gates the whole rail behind SHOW_FOR_YOU_RAIL (launchFeatures.js)
// — false skips the RPC + TMDB hydration entirely rather than just hiding it.
export function useForYou(limit = 20, enabled = true) {
  const [items, setItems]     = useState([]);
  const [reason, setReason]   = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!enabled) return;
    let cancelled = false;

    async function load() {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.user) { if (!cancelled) setLoading(false); return; }

      const { data: rows, error } = await supabase.rpc('get_for_you', { p_limit: limit });
      if (cancelled || error || !rows?.length) { if (!cancelled) setLoading(false); return; }

      const hydrated = await Promise.all(
        rows.map(async (row) => {
          const details = await tmdb.getBasicDetails(row.media_type, row.tmdb_id).catch(() => null);
          if (!details?.id || !details.poster_path) return null;
          return { ...details, media_type: row.media_type, genre_ids: details.genres?.map(g => g.id) ?? [] };
        })
      );

      if (cancelled) return;
      setItems(hydrated.filter(Boolean));
      setReason(rows[0]?.reason ?? null);
      setLoading(false);
    }

    load();
    return () => { cancelled = true; };
  }, [limit, enabled]);

  if (!enabled) {
    return { items: [], reason: null, loading: false };
  }

  return { items, reason, loading };
}
