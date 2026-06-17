// Regional-coverage preference for the streaming picks (hidden_gem, watch_tonight):
// favour titles the whole audience can watch. Tier 3 = available in all of
// US/UK/AU, tier 2 = any two, tier 1 = US only. A title available only in UK or
// only in AU (not US) is tier 0 — not eligible.
export const coverageTier = (presentRegions) => {
  const set = new Set(presentRegions);
  if (set.size >= 3) return 3;
  if (set.size === 2) return 2;
  return set.has('US') ? 1 : 0;
};

// Which of US/UK/AU have at least one flatrate provider, from a getStreamingRegions() object.
export const regionsWithProviders = (streaming) =>
  ['US', 'UK', 'AU'].filter(r => (streaming?.[r]?.length || 0) > 0);

// From a list of {tier} items, return the items in the best (highest) non-empty
// tier — caller then random-picks within it.
export const bestTier = (items) => {
  const eligible = items.filter(i => i.tier > 0);
  if (!eligible.length) return [];
  const top = Math.max(...eligible.map(i => i.tier));
  return eligible.filter(i => i.tier === top);
};
