// Recently-featured TMDB ids for a post type, so the fixed-theme picks
// (watch_tonight, hidden_gem) don't repeat a title week to week. Best-effort:
// with no DB (e.g. the preview), returns an empty set.
export const recentlyUsed = async (supabase, postType, days = 90) => {
  if (!supabase) return new Set();
  const since = new Date(Date.now() - days * 86400000).toISOString();
  const { data } = await supabase
    .from('marketing_posts')
    .select('tmdb_refs')
    .eq('post_type', postType)
    .gte('created_at', since);
  const ids = new Set();
  for (const row of data || []) for (const ref of row.tmdb_refs || []) ids.add(ref.id);
  return ids;
};
