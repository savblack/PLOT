// DOM route wrapper; data, preferences and agenda logic are shared with native.
import { Link } from 'react-router-dom';
import { useApp } from '../hooks/useApp.js';
import { GUIDE_REGIONS } from '@plot/core/broadcastGuide.js';
import { BROADCAST_GUIDE as COPY } from '@plot/core/copy/broadcastGuide.js';
import { BroadcastAgenda } from './BroadcastGuidePreview.jsx';

export default function GuideView() {
  const preferences = useApp().broadcastPreferences;
  if (preferences.loading) return <p role="status">{COPY.loading}</p>;
  if (preferences.error) return <div role="alert"><p>{COPY.preferencesError}</p><button onClick={preferences.retry}>{COPY.retry}</button></div>;
  const market = GUIDE_REGIONS.find(m => m.id === preferences.value.market_id);
  if (!market || !market.provider || market.scope === 'unavailable') return <section className="broadcast-guide"><p>{market ? COPY.unsupported : COPY.chooseMarket}</p><Link to="/settings?section=viewing">{COPY.settings}</Link></section>;
  return <BroadcastAgenda key={market.id} region={market.id} selection={preferences.value.channel_ids} saving={preferences.saving} onSave={channel_ids => preferences.save({ market_id: market.id, channel_ids })} />;
}
