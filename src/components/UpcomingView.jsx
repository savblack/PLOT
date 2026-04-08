import LoadingSpinner from './LoadingSpinner';

export default function UpcomingView({
  upcomingTimeFilter, setUpcomingTimeFilter,
  mediaFilter, feedLayout,
  upcoming, upcomingTV,
  onItemClick,
}) {
  const filterByTimeRange = (items, filter) => {
    const now = new Date(); now.setHours(0, 0, 0, 0);
    let start = now, end;
    if (filter === 'week')       { end = new Date(now); end.setDate(now.getDate() + 7); }
    if (filter === 'next-week')  { start = new Date(now); start.setDate(now.getDate() + 7); end = new Date(start); end.setDate(start.getDate() + 7); }
    if (filter === 'month')      { end = new Date(now.getFullYear(), now.getMonth() + 1, 0); }
    if (filter === 'next-month') { start = new Date(now.getFullYear(), now.getMonth() + 1, 1); end = new Date(now.getFullYear(), now.getMonth() + 2, 0); }
    return items.filter(item => { const d = new Date(item.release_date || item.first_air_date); return d >= start && d <= end; });
  };

  const items = filterByTimeRange(mediaFilter === 'movie' ? upcoming : upcomingTV, upcomingTimeFilter);
  const allItems = mediaFilter === 'movie' ? upcoming : upcomingTV;

  if (allItems.length === 0) return (
    <section className="upcoming">
      <div className="section-header-row">
        <h2 className="section-title">Upcoming</h2>
      </div>
      <LoadingSpinner />
    </section>
  );

  return (
    <section className="upcoming">
      <div className="section-header-row">
        <h2 className="section-title">Upcoming</h2>
      </div>
      <div className="journal-tab-nav">
        {[['week','This Week'],['next-week','Next Week'],['month','This Month'],['next-month','Next Month']].map(([val, label]) => (
          <button key={val} className={`journal-tab-btn ${upcomingTimeFilter === val ? 'active' : ''}`} onClick={() => setUpcomingTimeFilter(val)}>{label}</button>
        ))}
      </div>
      <div className="bento-grid">
        {items.map((item, index) => (
          <div key={item.id} className={`bento-item glass ${feedLayout === 'bento' && index % 5 === 0 ? 'large' : ''}`} onClick={() => onItemClick(item)}>
            {item.poster_path
              ? <img src={`https://image.tmdb.org/t/p/w342${item.poster_path}`} alt={item.title || item.name} loading="lazy" decoding="async" />
              : <div className="no-image">{item.title || item.name}</div>
            }
            <div className="overlay">
              <span className="rating-tag date-tag">
                {new Date(item.release_date || item.first_air_date).toLocaleDateString('en-GB', {
                  day: 'numeric',
                  month: 'long',
                  year: 'numeric'
                })}
              </span>
              <h3>{item.title || item.name}</h3>
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}
