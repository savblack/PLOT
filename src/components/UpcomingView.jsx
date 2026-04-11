import { useMemo } from 'react';
import LoadingSpinner from './LoadingSpinner';

function formatDateHeader(dateStr) {
  const d = new Date(dateStr);
  const now = new Date(); now.setHours(0,0,0,0);
  const tomorrow = new Date(now); tomorrow.setDate(now.getDate() + 1);
  if (d.toDateString() === now.toDateString()) return { label: 'Today', sub: d.toLocaleDateString('en-GB', { day: 'numeric', month: 'long' }), isToday: true };
  if (d.toDateString() === tomorrow.toDateString()) return { label: 'Tomorrow', sub: d.toLocaleDateString('en-GB', { day: 'numeric', month: 'long' }), isToday: false };
  return {
    label: d.toLocaleDateString('en-GB', { weekday: 'long' }),
    sub: d.toLocaleDateString('en-GB', { day: 'numeric', month: 'long' }),
    isToday: false,
  };
}

export default function UpcomingView({
  upcomingTimeFilter, setUpcomingTimeFilter,
  mediaFilter, setMediaFilter,
  upcoming, upcomingTV,
  onItemClick,
  user, userLists, listItems, createList, toggleListItem,
}) {
  const filterByTimeRange = (items, filter) => {
    const now = new Date(); now.setHours(0, 0, 0, 0);
    let start = now, end;
    if (filter === 'week')       { end = new Date(now); end.setDate(now.getDate() + 7); }
    if (filter === 'next-week')  { start = new Date(now); start.setDate(now.getDate() + 7); end = new Date(start); end.setDate(start.getDate() + 7); }
    if (filter === 'month')      { end = new Date(now.getFullYear(), now.getMonth() + 1, 0); }
    if (filter === 'next-month') { start = new Date(now.getFullYear(), now.getMonth() + 1, 1); end = new Date(now.getFullYear(), now.getMonth() + 2, 0); }
    return items.filter(item => { const d = new Date(item.release_date || item.first_air_date); return d >= start && (end ? d <= end : true); });
  };

  const effectiveSource = mediaFilter === 'all' ? [...upcoming, ...upcomingTV] : mediaFilter === 'movie' ? upcoming : upcomingTV;
  const items = filterByTimeRange(effectiveSource, upcomingTimeFilter)
    .sort((a, b) => new Date(a.release_date || a.first_air_date) - new Date(b.release_date || b.first_air_date));

  // Hero = highest popularity item in the set
  const hero = useMemo(() => items.length ? [...items].sort((a, b) => (b.popularity || 0) - (a.popularity || 0))[0] : null, [items]);
  const rest = hero ? items.filter(i => i.id !== hero.id) : items;

  // Group remaining items by date
  const dateGroups = useMemo(() => {
    const groups = {};
    rest.forEach(item => {
      const key = item.release_date || item.first_air_date || '';
      if (!groups[key]) groups[key] = [];
      groups[key].push(item);
    });
    return Object.entries(groups).sort(([a], [b]) => new Date(a) - new Date(b));
  }, [rest]);

  // Watchlist helpers
  const watchlist = userLists?.find(l => l.name === '__watchlist__');
  const watchlistIds = new Set((listItems || []).filter(li => li.list_id === watchlist?.id).map(li => li.tmdb_id));

  const toggleWatchlist = async (e, item) => {
    e.stopPropagation();
    if (!user) return;
    let wlId = watchlist?.id;
    if (!wlId) {
      const created = await createList('__watchlist__');
      wlId = created?.id;
    }
    if (!wlId) return;
    const isSaved = watchlistIds.has(item.id);
    toggleListItem(wlId, { ...item, id: item.id }, !isSaved);
  };

  const filterRow = (
    <div className="mobile-filter-row">
      <button className={mediaFilter === 'all' ? 'active' : ''} onClick={() => setMediaFilter('all')}>All</button>
      <button className={mediaFilter === 'movie' ? 'active' : ''} onClick={() => setMediaFilter('movie')}>Movies</button>
      <button className={mediaFilter === 'tv' ? 'active' : ''} onClick={() => setMediaFilter('tv')}>TV</button>
    </div>
  );

  if (effectiveSource.length === 0) return (
    <section className="upcoming">
      <div className="section-header-row">
        <h2 className="section-title">Upcoming</h2>
        {filterRow}
      </div>
      <LoadingSpinner />
    </section>
  );

  return (
    <section className="upcoming">
      <div className="section-header-row">
        <h2 className="section-title">Upcoming</h2>
        {filterRow}
      </div>
      <div className="journal-tab-nav">
        {[['week','This Week'],['next-week','Next Week'],['month','This Month'],['next-month','Next Month']].map(([val, label]) => (
          <button key={val} className={`journal-tab-btn ${upcomingTimeFilter === val ? 'active' : ''}`} onClick={() => setUpcomingTimeFilter(val)}>{label}</button>
        ))}
      </div>

      {items.length === 0 ? (
        <p className="feed-empty-state">Nothing releasing in this window.</p>
      ) : (
        <>
          {/* Hero */}
          {hero && (
            <div className="upcoming-hero" onClick={() => onItemClick(hero)}>
              {hero.backdrop_path
                ? <img src={`https://image.tmdb.org/t/p/w1280${hero.backdrop_path}`} alt={hero.title || hero.name} />
                : hero.poster_path
                  ? <img src={`https://image.tmdb.org/t/p/w780${hero.poster_path}`} alt={hero.title || hero.name} style={{ objectPosition: 'top' }} />
                  : null
              }
              <div className="upcoming-hero-overlay">
                <div className="upcoming-hero-eyebrow">
                  {new Date(hero.release_date || hero.first_air_date).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' }).toUpperCase()}
                </div>
                <h3 className="upcoming-hero-title">{hero.title || hero.name}</h3>
                <p className="upcoming-hero-date">
                  {new Date(hero.release_date || hero.first_air_date).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })}
                </p>
                {user && (
                  <button
                    className={`upcoming-watchlist-btn hero ${watchlistIds.has(hero.id) ? 'saved' : ''}`}
                    onClick={e => toggleWatchlist(e, hero)}
                  >
                    {watchlistIds.has(hero.id) ? '✓ Saved' : 'Add to Watchlist'}
                  </button>
                )}
              </div>
            </div>
          )}

          {/* Date groups */}
          {dateGroups.map(([dateKey, groupItems]) => {
            const { label, sub, isToday } = formatDateHeader(dateKey);
            return (
              <div key={dateKey} className="upcoming-date-group">
                <div className="upcoming-date-header">
                  <span className="upcoming-date-label">{label}</span>
                  <span className="upcoming-date-sub">{sub}</span>
                </div>
                <div className="upcoming-poster-row">
                  {groupItems.map(item => {
                    const saved = watchlistIds.has(item.id);
                    return (
                      <div key={item.id} className="upcoming-card" onClick={() => onItemClick(item)}>
                        <div className="upcoming-card-img">
                          {item.poster_path
                            ? <img src={`https://image.tmdb.org/t/p/w342${item.poster_path}`} alt={item.title || item.name} loading="lazy" decoding="async" />
                            : <div className="no-image">{item.title || item.name}</div>
                          }
                          {user && (
                            <button
                              className={`upcoming-watchlist-btn card ${saved ? 'saved' : ''}`}
                              onClick={e => toggleWatchlist(e, item)}
                              title={saved ? 'Remove from watchlist' : 'Add to watchlist'}
                            >
                              {saved ? '✓' : '+'}
                            </button>
                          )}
                        </div>
                        <div className="upcoming-card-title">{item.title || item.name}</div>
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </>
      )}
    </section>
  );
}
