// Web-only storage adapter for the development preview. Native account storage is
// tracked in docs/guide/implementation.md alongside the rollout work.
import { GUIDE_REGIONS } from '@plot/core/broadcastGuide.js';

export function readBroadcastRegion() {
  try {
    const saved = localStorage.getItem('plot-guide-preview-region');
    if (GUIDE_REGIONS.some(region => region.id === saved)) return saved;
  } catch { /* Storage may be unavailable; retain the preview default. */ }
  return 'Sydney';
}
