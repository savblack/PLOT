import { useState, useMemo } from 'react';

const DAY_NAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

function StarIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="white" width="8" height="8">
      <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"/>
    </svg>
  );
}

function TrendIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5" width="8" height="8">
      <polyline points="22 7 13.5 15.5 8.5 10.5 2 17"/>
      <polyline points="16 7 22 7 22 13"/>
    </svg>
  );
}

function CheckIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5" width="8" height="8">
      <path d="M12 22c5.523 0 10-4.477 10-10S17.523 2 12 2 2 6.477 2 12s4.477 10 10 10z"/>
      <path d="M9 12l2 2 4-4"/>
    </svg>
  );
}

export default function TimelineTab({ watched, onItemClick }) {
  const [selectedYear, setSelectedYear] = useState('current');
  const [searchFilter, setSearchFilter] = useState('');
  const [sort, setSort] = useState('newest');

  // Available years
  const years = useMemo(() => {
    const ys = new Set();
    watched.forEach(i => {
      if (i.watched_at) ys.add(new Date(i.watched_at).getFullYear());
    });
    return [...ys].sort((a, b) => b - a);
  }, [watched]);

  const currentYear = years[0] || new Date().getFullYear();
  const resolvedYear = selectedYear === 'current' ? currentYear : selectedYear;

  // Apply all filters
  const filtered = useMemo(() => {
    return watched
      .filter(i => i.watched_at)
      .filter(i => {
        if (resolvedYear !== 'all' && new Date(i.watched_at).getFullYear() !== resolvedYear) return false;
        if (searchFilter && !(i.title || i.name || '').toLowerCase().includes(searchFilter.toLowerCase())) return false;
        return true;
      });
  }, [watched, resolvedYear, searchFilter]);

  // Group by year-month
  const byMonth = useMemo(() => {
    const map = {};
    filtered.forEach(item => {
      const d = new Date(item.watched_at);
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
      if (!map[key]) map[key] = [];
      map[key].push(item);
    });
    const entrySort = sort === 'newest'
      ? (a, b) => new Date(b.watched_at) - new Date(a.watched_at)
      : (a, b) => new Date(a.watched_at) - new Date(b.watched_at);
    const monthSort = sort === 'newest'
      ? ([a], [b]) => b.localeCompare(a)
      : ([a], [b]) => a.localeCompare(b);
    return Object.entries(map)
      .sort(monthSort)
      .map(([key, items]) => {
        const [y, m] = key.split('-').map(Number);
        const d = new Date(y, m - 1, 1);
        const rated = items.filter(i => i.rating > 0);
        const mAvg = rated.length > 0
          ? (rated.reduce((s, i) => s + i.rating, 0) / rated.length).toFixed(1)
          : null;
        return {
          key,
          label: d.toLocaleString('default', { month: 'long', year: 'numeric' }),
          monthName: d.toLocaleString('default', { month: 'long' }),
          count: items.length,
          avgRating: mAvg,
          perfect10s: items.filter(i => i.rating === 10).length,
          items: [...items].sort(entrySort),
        };
      });
  }, [filtered, sort]);

  // Milestones — computed from year-filtered only (not other filters) so they always show
  const yearFiltered = useMemo(() => {
    return watched
      .filter(i => i.watched_at)
      .filter(i => resolvedYear === 'all' || new Date(i.watched_at).getFullYear() === resolvedYear);
  }, [watched, resolvedYear]);

  const milestones = useMemo(() => {
    // Build byMonth from yearFiltered to find best month
    const map = {};
    yearFiltered.forEach(item => {
      const d = new Date(item.watched_at);
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
      if (!map[key]) map[key] = [];
      map[key].push(item);
    });
    const monthList = Object.entries(map).map(([key, items]) => {
      const rated = items.filter(i => i.rating > 0);
      const mAvg = rated.length > 0
        ? (rated.reduce((s, i) => s + i.rating, 0) / rated.length).toFixed(1)
        : null;
      return { key, avgRating: mAvg, count: items.length, items };
    });

    const bestMonth = [...monthList]
      .filter(m => m.items.filter(i => i.rating > 0).length >= 3)
      .sort((a, b) => parseFloat(b.avgRating || 0) - parseFloat(a.avgRating || 0))[0];

    const first10Item = [...yearFiltered]
      .filter(i => i.rating === 10)
      .sort((a, b) => new Date(a.watched_at) - new Date(b.watched_at))[0];
    const first10Id = first10Item ? (first10Item.tmdb_id || first10Item.id) : null;

    const allTimeSorted = [...watched]
      .filter(i => i.watched_at)
      .sort((a, b) => new Date(a.watched_at) - new Date(b.watched_at));
    const hundredthItem = allTimeSorted.length >= 100 ? allTimeSorted[99] : null;
    const hundredthId = hundredthItem && yearFiltered.some(i =>
      (i.tmdb_id || i.id) === (hundredthItem.tmdb_id || hundredthItem.id)
    ) ? (hundredthItem.tmdb_id || hundredthItem.id) : null;

    return { bestMonthKey: bestMonth?.key, first10Id, hundredthId, hundredthItem };
  }, [yearFiltered, watched]);

  const hasActiveFilters = !!searchFilter;

  if (watched.filter(i => i.watched_at).length === 0) {
    return (
      <div className="empty-journal-state">
        <h3>Nothing logged yet</h3>
        <p>Log some movies or shows to build your timeline.</p>
      </div>
    );
  }

  return (
    <div className="tl-wrap">
      {/* Filter bar */}
      <div className="history-filters tl-filters">
        <input
          className="history-search-input"
          type="text"
          placeholder="Search titles…"
          value={searchFilter}
          onChange={e => setSearchFilter(e.target.value)}
        />
        <select value={selectedYear} onChange={e => setSelectedYear(e.target.value === 'all' ? 'all' : parseInt(e.target.value))}>
          {years.map(y => <option key={y} value={y}>{y}</option>)}
          <option value="all">All time</option>
        </select>
        <select value={sort} onChange={e => setSort(e.target.value)}>
          <option value="newest">Newest first</option>
          <option value="oldest">Oldest first</option>
        </select>
      </div>

      {/* Empty state */}
      {filtered.length === 0 && (
        <div className="empty-journal-state" style={{ paddingTop: '3rem' }}>
          <h3>{hasActiveFilters ? 'No matches' : `Nothing logged in ${resolvedYear}`}</h3>
          <p>{hasActiveFilters ? 'No items match the selected filters.' : 'Select a different year or log something new.'}</p>
        </div>
      )}

      {/* Timeline */}
      {filtered.length > 0 && (
        <div className="tl-timeline">
          {byMonth.map(({ key, label, monthName, count, avgRating: mAvg, perfect10s, items }) => {
            const isBestMonth = !hasActiveFilters && milestones.bestMonthKey === key;
            return (
              <div key={key}>
                <div className="tl-month-marker">
                  <div className="tl-month-dot" />
                  <div className="tl-month-head">
                    <span className="tl-month-name">{label}</span>
                    <span className="tl-month-meta">
                      {count} title{count !== 1 ? 's' : ''}
                      {mAvg ? ` · avg ${mAvg}` : ''}
                      {isBestMonth ? ' · best month 🔥' : ''}
                    </span>
                  </div>
                </div>

                {items.map((item, idx) => {
                  const d = new Date(item.watched_at);
                  const itemId = item.tmdb_id || item.id;
                  const isFirst10 = !hasActiveFilters && milestones.first10Id === itemId;
                  const isHundredth = !hasActiveFilters && milestones.hundredthId === itemId;

                  return (
                    <div key={item.id || idx}>
                      {isFirst10 && (
                        <div className="tl-landmark">
                          <div className="tl-landmark-dot"><StarIcon /></div>
                          <div className="tl-landmark-eyebrow">
                            Milestone · {d.toLocaleString('default', { month: 'short', day: 'numeric' })}
                          </div>
                          <div className="tl-landmark-title">
                            First perfect 10 of {resolvedYear === 'all' ? 'all time' : resolvedYear}
                          </div>
                          <div className="tl-landmark-body">
                            {item.title || item.name}. You gave it a 10.
                          </div>
                        </div>
                      )}

                      <div className="tl-entry" onClick={() => onItemClick(item)}>
                        <div className={`tl-entry-dot${item.rating > 0 ? ' rated' : ''}`} />
                        <div className="tl-edate">
                          <span className="tl-enum">{d.getDate()}</span>
                          <span className="tl-eday">{DAY_NAMES[d.getDay()]}</span>
                        </div>
                        {item.poster_path ? (
                          <img
                            className="tl-poster"
                            src={`https://image.tmdb.org/t/p/w92${item.poster_path}`}
                            alt={item.title || item.name}
                            loading="lazy"
                          />
                        ) : (
                          <div className="tl-poster tl-poster-empty" />
                        )}
                        <div className="tl-ebody">
                          <div className="tl-etitle">{item.title || item.name}</div>
                          <div className="tl-chips">
                            {item.rating > 0 && (
                              <span className={`tl-chip${item.rating >= 8 ? ' hi' : item.rating <= 4 ? ' lo' : ''}`}>
                                {item.rating}/10
                              </span>
                            )}
                            {item.mood && <span className="tl-chip">{item.mood}</span>}
                            {item.watchStatus && <span className="tl-chip">{item.watchStatus}</span>}
                          </div>
                        </div>
                      </div>

                      {isHundredth && (
                        <div className="tl-landmark">
                          <div className="tl-landmark-dot"><CheckIcon /></div>
                          <div className="tl-landmark-eyebrow">
                            Milestone · {d.toLocaleString('default', { month: 'short', day: 'numeric', year: 'numeric' })}
                          </div>
                          <div className="tl-landmark-title">100 titles logged on Plot</div>
                          <div className="tl-landmark-body">
                            It was <em>{item.title || item.name}</em>.{item.rating ? ` You gave it ${item.rating}.` : ''}
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })}

                {isBestMonth && (
                  <div className="tl-landmark">
                    <div className="tl-landmark-dot"><TrendIcon /></div>
                    <div className="tl-landmark-eyebrow">{monthName} recap</div>
                    <div className="tl-landmark-title">Your best month of the year</div>
                    <div className="tl-landmark-body">
                      {count} titles{mAvg ? `, highest avg rating of any month.` : '.'}
                    </div>
                    <div className="tl-stat-landmark">
                      <div className="tl-mini-stat">
                        <span className="tl-ms-num">{count}</span>
                        <span className="tl-ms-label">Watched</span>
                      </div>
                      {mAvg && (
                        <div className="tl-mini-stat">
                          <span className="tl-ms-num">{mAvg}</span>
                          <span className="tl-ms-label">Avg rating</span>
                        </div>
                      )}
                      {perfect10s > 0 && (
                        <div className="tl-mini-stat">
                          <span className="tl-ms-num">{perfect10s}</span>
                          <span className="tl-ms-label">Perfect 10s</span>
                        </div>
                      )}
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
