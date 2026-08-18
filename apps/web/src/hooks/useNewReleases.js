// Moved to @plot/core/useNewReleases.js (shared, platform-agnostic core).
// Wrapper rather than a bare re-export for the same reason as useDiscover.js:
// core takes `hideKids` as an argument, and this is where web supplies it.
import { useNewReleases as useCoreNewReleases } from '@plot/core/useNewReleases.js';
import { useApp } from '../App.jsx';

export { GENRE_RAILS } from '@plot/core/useNewReleases.js';

export function useNewReleases() {
  const { profile } = useApp();
  return useCoreNewReleases({ hideKids: !(profile?.include_kids_content ?? true) });
}
