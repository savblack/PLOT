// The title panel's Episode alerts card, for a TV show someone follows (saved
// or watching). The switch is that show's new-episode notifications; while it
// is on, the next episode and Add to calendar sit under it. The store and the
// line's wording live in @plot/core (useEpisodeAlerts.js, episodeAlerts.js).
// Mobile renders the same card in apps/mobile/components/EpisodeAlertsCard.tsx.
import { useLocation, useNavigate } from 'react-router-dom';
import { useEpisodeAlerts } from '@plot/core/useEpisodeAlerts.js';
import { nextEpisodeLine } from '@plot/core/episodeAlerts.js';
import { buildCalendarEvents } from '@plot/core/calendar.js';
import { edgeFunctionUrl } from '@plot/core/functions.js';
import { emit, NOTICE_EVENT } from '@plot/core/events.js';
import { tmdb } from '@plot/core/tmdb.js';
import { EPISODE_ALERTS as T } from '@plot/core/copy/episodeAlerts.js';
import { useApp } from '../hooks/useApp.js';
import { usePremium } from '../hooks/usePremium.js';
import { track, EVENTS } from '../lib/analytics.js';
import { localDateStr } from '../utils/date.js';
import { downloadICS } from '../utils/ics.js';
import { premiumPlansPath } from '../utils/premiumExplore.js';
import EpisodeAlertsView from './EpisodeAlertsView.jsx';

/**
 * @param {{ show: { id: number, name?: string, poster_path?: string | null, next_episode_to_air?: any } }} props
 *   show: the panel's TMDB TV details
 */
export default function EpisodeAlertsCard({ show }) {
  const { user, profile } = useApp();
  const premium = usePremium(profile);
  const navigate = useNavigate();
  const location = useLocation();
  const alerts = useEpisodeAlerts(user?.id, show?.id);
  const title = show?.name || '';
  const next = nextEpisodeLine(show, localDateStr());

  if (!user || !show?.id) return null;

  const onToggle = async () => {
    const result = await alerts.toggle();
    if (!result.changed) return;
    track(EVENTS.EPISODE_ALERTS_TOGGLED, { tmdb_id: show.id, on: result.on });
    emit(NOTICE_EVENT, { message: result.on ? T.toastOn(title) : T.toastOff(title) });
  };

  const subscribe = async () => {
    if (!premium.isPremium) {
      track(EVENTS.TITLE_CALENDAR_ACTION, { action: 'upgrade' });
      navigate(premiumPlansPath(`${location.pathname}${location.search}`));
      return;
    }
    if (!profile?.calendar_token) {
      // The private link is made (and can be revoked) in Settings.
      track(EVENTS.TITLE_CALENDAR_ACTION, { action: 'subscribe_setup' });
      navigate('/settings?section=connections');
      return;
    }
    await navigator.clipboard?.writeText(edgeFunctionUrl('calendar-feed', { token: profile.calendar_token }));
    track(EVENTS.TITLE_CALENDAR_ACTION, { action: 'subscribe' });
    emit(NOTICE_EVENT, { message: T.linkCopied });
  };

  const download = async () => {
    const events = await buildCalendarEvents({
      watchlist: [{ tmdb_id: show.id, media_type: 'tv', title, poster_path: show.poster_path ?? null }],
      todayStr: localDateStr(),
      fetchTvDetails: (id) => tmdb.getTVDetails(id),
      fetchSeason: (id, season) => tmdb.getSeason(id, season),
    });
    if (!events.length) { emit(NOTICE_EVENT, { message: T.nothingToDownload }); return; }
    track(EVENTS.TITLE_CALENDAR_ACTION, { action: 'download', count: events.length });
    downloadICS(events, `${title.replace(/[^\w-]+/g, '-').replace(/^-|-$/g, '').toLowerCase() || 'plot'}.ics`);
  };

  return (
    <EpisodeAlertsView
      title={title}
      on={alerts.on}
      ready={!alerts.loading}
      busy={alerts.loading || alerts.busy}
      error={alerts.error}
      next={next}
      isPremium={premium.isPremium}
      onToggle={onToggle}
      onSubscribe={subscribe}
      onDownload={download}
    />
  );
}
