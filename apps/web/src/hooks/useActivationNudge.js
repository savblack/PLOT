// Whether the empty-library nudge shows (core/activationNudge.js): every read
// has answered and the account has no titles in its watchlist, watching or
// history. It hides itself at the first title, from any of the three.
import { getConfig } from '@plot/core/config.js';
import { activationNudgeSources, shouldShowActivationNudge, useHistoryCount } from '@plot/core/activationNudge.js';
import { useApp } from './useApp.js';

export function useActivationNudge() {
  const { user, watchlist, watching } = useApp();
  const historyCount = useHistoryCount(user?.id);
  const ready = !!user && !!watchlist && !!watching
    && !watchlist.loading && !watching.loading && !watchlist.error && !watching.error;
  return {
    show: shouldShowActivationNudge({
      ready,
      watchlistCount: watchlist?.items?.length ?? 0,
      watchingCount: watching?.items?.length ?? 0,
      historyCount,
    }),
    sources: activationNudgeSources(getConfig()),
  };
}
