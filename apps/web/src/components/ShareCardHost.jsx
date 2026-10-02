import { useEffect, useState } from 'react';
import { on, SHARE_CARD_REQUESTED_EVENT } from '@plot/core/events.js';
import { useShareCards } from '../hooks/useShareCards.js';
import { useApp } from '../hooks/useApp.js';
import ShareCardSheet from './ShareCardSheet.jsx';

/* One place that answers requestShareCard() from anywhere in the app: the
   streak toast, the month-wrap notice, later a push. Mounted once in App.
   History and the profile open their own sheet because they already hold
   the data; this host loads it on demand for everything else. Web-only in
   the same way the sheet is; mobile mounts its own host over the same
   event. */
export default function ShareCardHost() {
  const { user, profile } = useApp();
  const [request, setRequest] = useState(null); // { card, source } | null
  useEffect(() => on(SHARE_CARD_REQUESTED_EVENT, (req) => { if (req?.card) setRequest(req); }), []);
  const { cards, loading } = useShareCards({ userId: user?.id, profile, enabled: !!request });
  if (!request || !user) return null;
  return (
    <ShareCardSheet
      cards={cards}
      loading={loading}
      preset={request.card}
      profile={profile}
      source={request.source}
      onClose={() => setRequest(null)}
    />
  );
}
