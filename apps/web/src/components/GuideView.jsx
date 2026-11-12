// DOM route wrapper; data, preferences and agenda logic are shared with native.
import { useApp } from '../hooks/useApp.js';
import { GUIDE_REGIONS } from '@plot/core/broadcastGuide.js';
import { BROADCAST_GUIDE as COPY } from '@plot/core/copy/broadcastGuide.js';
import { BroadcastAgenda } from './BroadcastGuidePreview.jsx';
import BroadcastGuideSetup from './BroadcastGuideSetup.jsx';
import LoadingSpinner from './LoadingSpinner.jsx';
import EmptyState from './EmptyState.jsx';

export default function GuideView() {
  const { broadcastPreferences: preferences, profile } = useApp();
  if (preferences.loading) return <LoadingSpinner />;
  if (preferences.error) return <EmptyState role="alert" title={COPY.preferencesError} action={<button type="button" className="btn btn-secondary btn-sm" onClick={preferences.retry}>{COPY.retry}</button>} />;
  const market = GUIDE_REGIONS.find(m => m.id === preferences.value.market_id);
  if (!market || !market.provider || market.scope === 'unavailable') return <BroadcastGuideSetup key={preferences.value.market_id || 'new'} preferences={preferences} profileRegion={profile?.region} />;
  return <BroadcastAgenda key={market.id} region={market.id} selection={preferences.value.channel_ids} saving={preferences.saving} onSave={channel_ids => preferences.save({ market_id: market.id, channel_ids })} />;
}
