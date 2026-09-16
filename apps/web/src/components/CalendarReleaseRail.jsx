import { getTmdbRegion } from '@plot/core/tmdb.js';
import { buildProviderLogoCacheKey } from '../utils/providerLogos.js';
import { useRailScroll } from '../hooks/useRailScroll.js';
import ScrollRail from './ScrollRail.jsx';
import RailArrows from './RailArrows.jsx';
import MediaCard from './MediaCard.jsx';
import { DayGutter } from './CalendarStream.jsx';

/* One day of "All releases": the diary gutter and a single poster rail of
   that day's titles. The rail is the app's ScrollRail, so wheel, trackpad and
   drag behave as on Home; its arrows sit top-right of the rail body, on their
   own line above the posters, and render only when the rail overflows. */
export default function CalendarReleaseRail({ day, openPanel, watchlist, providerLogos }) {
  const rail   = useRailScroll();
  const region = getTmdbRegion();
  return (
    <>
      <DayGutter ds={day.ds} />
      <div className="cal-release-body">
        <div className="cal-release-arrows"><RailArrows rail={rail} /></div>
        <ScrollRail rail={rail} className="cal-release-rail">
        {day.items.map(item => (
          <MediaCard
            key={`${item.media_type}-${item.id}`}
            item={item}
            openPanel={openPanel}
            providerLogo={providerLogos[buildProviderLogoCacheKey({
              id: item.id || item.tmdb_id,
              type: item.media_type || 'movie',
              region,
            })] || null}
            watchlist={watchlist}
          />
        ))}
        </ScrollRail>
      </div>
    </>
  );
}
