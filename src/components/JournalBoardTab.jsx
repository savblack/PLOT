import { useEffect } from 'react';
import { GENRES } from '../constants';
import EmptyState from './EmptyState';

export default function JournalBoardTab({ watched, user, onItemClick, onMount }) {
  useEffect(() => { onMount?.(); }, []);

  // ── Derived stats ──────────────────────────────────────
  const now = new Date();
  const thisYear = now.getFullYear();
  const lastYear = thisYear - 1;

  const thisYearItems = watched.filter(i => i.watched_at && new Date(i.watched_at).getFullYear() === thisYear);
  const lastYearItems = watched.filter(i => i.watched_at && new Date(i.watched_at).getFullYear() === lastYear);
  const thisYearCount = thisYearItems.length;
  const lastYearCount = lastYearItems.length;
  const yearDelta = thisYearCount - lastYearCount;

  const ratedItems = watched.filter(i => i.rating > 0);
  const avgRating = ratedItems.length > 0
    ? (ratedItems.reduce((s, i) => s + i.rating, 0) / ratedItems.length).toFixed(1)
    : null;

  const perfect10s = watched.filter(i => i.rating === 10);

  // Weekly logging streak
  const getWeekStart = (date) => {
    const d = new Date(date);
    d.setHours(0, 0, 0, 0);
    d.setDate(d.getDate() - d.getDay()); // Sunday
    return d.getTime();
  };
  const loggedWeeks = new Set(watched.filter(i => i.watched_at).map(i => getWeekStart(new Date(i.watched_at))));
  let streak = 0;
  let checkWeek = getWeekStart(now);
  // If nothing logged this week yet, start checking from last week
  if (!loggedWeeks.has(checkWeek)) checkWeek -= 7 * 24 * 60 * 60 * 1000;
  while (loggedWeeks.has(checkWeek)) {
    streak++;
    checkWeek -= 7 * 24 * 60 * 60 * 1000;
  }

  // Genre counts
  const genreIdToLabel = {};
  GENRES.forEach(g => {
    if (g.movieId) genreIdToLabel[g.movieId] = g.label;
    if (g.tvId)   genreIdToLabel[g.tvId]    = g.label;
  });
  const genreCounts = {};
  watched.forEach(i => (i.genre_ids || []).forEach(id => {
    const label = genreIdToLabel[id];
    if (label) genreCounts[label] = (genreCounts[label] || 0) + 1;
  }));
  const topGenres = Object.entries(genreCounts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 6);
  const maxGenreCount = topGenres[0]?.[1] || 1;

  // Mood counts
  const moodCounts = {};
  watched.forEach(i => { if (i.mood) moodCounts[i.mood] = (moodCounts[i.mood] || 0) + 1; });
  const topMoods = Object.entries(moodCounts).sort((a, b) => b[1] - a[1]);
  const maxMoodCount = topMoods[0]?.[1] || 1;

  // Films vs TV
  const movieCount = watched.filter(i => (i.media_type || (i.title ? 'movie' : 'tv')) === 'movie').length;
  const tvCount = watched.length - movieCount;
  const moviePct = watched.length > 0 ? Math.round((movieCount / watched.length) * 100) : 0;

  // By decade
  const decadeCounts = {};
  watched.forEach(i => {
    const dateStr = i.release_date || i.first_air_date;
    if (!dateStr) return;
    const year = new Date(dateStr).getFullYear();
    if (isNaN(year)) return;
    const key = year >= 2020 ? '2020s' : year >= 2010 ? '2010s' : year >= 2000 ? '2000s' : year >= 1990 ? '1990s' : 'Older';
    decadeCounts[key] = (decadeCounts[key] || 0) + 1;
  });
  const decadeOrder = ['2020s', '2010s', '2000s', '1990s', 'Older'];
  const topDecades = decadeOrder.filter(d => decadeCounts[d]).map(d => [d, decadeCounts[d]]);
  const maxDecadeCount = Math.max(...topDecades.map(d => d[1]), 1);

  // Rating distribution 1–10
  const ratingDist = Array.from({ length: 10 }, (_, i) => ({
    rating: i + 1,
    count: ratedItems.filter(item => item.rating === i + 1).length,
  }));
  const maxRatingCount = Math.max(...ratingDist.map(r => r.count), 1);

  // Monthly activity — last 12 months with weekly breakdown
  const monthlyActivity = Array.from({ length: 12 }, (_, i) => {
    const d = new Date(now.getFullYear(), now.getMonth() - (11 - i), 1);
    const year = d.getFullYear();
    const month = d.getMonth();
    const monthItems = watched.filter(item => {
      if (!item.watched_at) return false;
      const w = new Date(item.watched_at);
      return w.getFullYear() === year && w.getMonth() === month;
    });
    const weeks = [0, 0, 0, 0];
    monthItems.forEach(item => {
      const day = new Date(item.watched_at).getDate();
      const wi = day <= 7 ? 0 : day <= 14 ? 1 : day <= 21 ? 2 : 3;
      weeks[wi]++;
    });
    return { month: d.toLocaleString('default', { month: 'short' }), weeks, count: monthItems.length, isCurrent: i === 11 };
  });
  const maxWeekCount = Math.max(...monthlyActivity.flatMap(m => m.weeks), 1);
  const peakMonth = [...monthlyActivity].sort((a, b) => b.count - a.count)[0];

  // Top rated
  const topRated = [...ratedItems]
    .sort((a, b) => b.rating - a.rating || new Date(b.watched_at || 0) - new Date(a.watched_at || 0))
    .slice(0, 5);


  if (watched.length === 0) {
    return (
      <EmptyState
        eyebrow="Taste · blank"
        title="A blank page, for now."
        description="Log a few films or shows and we'll start mapping your patterns — genres, decades, moods, streaks."
      />
    );
  }

  return (
    <div className="taste-dashboard">

      {/* ── Hero number grid ─────────────────────────── */}
      <div className="td-hero">
        <div className="td-hero-cell td-hero-dark">
          <span className="td-hero-label">
            {thisYearCount > 0 ? `Logged ${thisYear}` : 'Total logged'}
          </span>
          <span className="td-hero-num">
            {thisYearCount > 0 ? thisYearCount : watched.length}
          </span>
          {thisYearCount > 0 && lastYearCount > 0 && (
            <span className="td-hero-sub">
              {yearDelta >= 0 ? `↑ ${yearDelta}` : `↓ ${Math.abs(yearDelta)}`} vs {lastYear}
            </span>
          )}
        </div>
        <div className="td-hero-cell td-hero-grey">
          <span className="td-hero-label">Logging streak</span>
          <span className="td-hero-num">{streak}</span>
          <span className="td-hero-sub">{streak === 1 ? 'week' : 'weeks'}</span>
        </div>
        <div className="td-hero-cell">
          <span className="td-hero-label">Avg rating</span>
          <span className="td-hero-num">{avgRating ?? '—'}</span>
          {avgRating && (
            <span className="td-hero-sub">
              {parseFloat(avgRating) >= 8 ? 'Generous critic' : parseFloat(avgRating) >= 6 ? 'Balanced critic' : 'Tough critic'}
            </span>
          )}
        </div>
        <div className="td-hero-cell">
          <span className="td-hero-label">Perfect 10s</span>
          <span className="td-hero-num">{perfect10s.length}</span>
          {perfect10s.length > 0 && (
            <span className="td-hero-sub">
              {perfect10s[0]?.title || perfect10s[0]?.name || ''}
            </span>
          )}
        </div>
      </div>

      {/* ── Rating dist + Monthly activity ───────────── */}
      <div className="td-two-col">
        {ratedItems.length > 0 && (
          <div className="td-card">
            <div className="td-card-label">Rating distribution</div>
            <div className="td-rdist-wrap">
              {ratingDist.map(({ rating, count }) => (
                <div key={rating} className="td-rdist-col">
                  <div className="td-rdist-bar-cell">
                    <div
                      className="td-rdist-bar"
                      style={{ height: `${Math.max((count / maxRatingCount) * 100, count > 0 ? 4 : 0)}%` }}
                      title={`${rating}/10 — ${count} title${count !== 1 ? 's' : ''}`}
                    />
                  </div>
                  <span className="td-rdist-num">{rating}</span>
                </div>
              ))}
            </div>
            {avgRating && (
              <div className="td-rdist-sub">
                {parseFloat(avgRating) >= 8 ? 'You rate generously — most things land at 8+' :
                 parseFloat(avgRating) >= 6 ? `Most ratings cluster around ${Math.round(parseFloat(avgRating))}` :
                 'Tough critic'}
              </div>
            )}
          </div>
        )}

        <div className="td-card">
          <div className="td-card-label">Monthly activity</div>
          <div className="td-month-grid">
            {monthlyActivity.map(({ month, weeks, count, isCurrent }) => (
              <div key={month + isCurrent} className="td-month-col">
                {weeks.map((wCount, wi) => {
                  const intensity = wCount / maxWeekCount;
                  const l = Math.round(235 - intensity * 190);
                  return (
                    <div
                      key={wi}
                      className="td-month-cell"
                      style={{ background: wCount === 0 ? '#ebebeb' : `rgb(${l},${l},${l})` }}
                      title={`${month} wk${wi + 1} — ${wCount} title${wCount !== 1 ? 's' : ''}`}
                    />
                  );
                })}
                <span className={`td-month-label${isCurrent ? ' current' : ''}`}>{month[0]}</span>
              </div>
            ))}
          </div>
          {peakMonth?.count > 0 && (
            <div className="td-rdist-sub">
              Most active: {peakMonth.month} · {peakMonth.count} title{peakMonth.count !== 1 ? 's' : ''}
            </div>
          )}
        </div>
      </div>

      {/* ── Movies vs TV ─────────────────────────────── */}
      <div className="td-card">
        <div className="td-card-label">Movies vs TV</div>
        <div className="td-ft-bar">
          <div className="td-ft-fill" style={{ width: `${moviePct}%` }} />
        </div>
        <div className="td-ft-labels">
          <span style={{ fontWeight: 500 }}>Movies {moviePct}%</span>
          <span style={{ color: 'var(--text-secondary)' }}>TV Series {100 - moviePct}%</span>
        </div>
      </div>

      {/* ── Mood fingerprint ─────────────────────────── */}
      {topMoods.length > 0 && (
        <div className="td-card">
          <div className="td-card-label">Mood fingerprint</div>
          <div className="td-mood-cloud">
            {topMoods.slice(0, 8).map(([mood, count]) => {
              const ratio = count / maxMoodCount;
              const cls = ratio > 0.7 ? 'td-mood-lg' : ratio > 0.4 ? 'td-mood-md' : 'td-mood-sm';
              return <span key={mood} className={`td-mood-chip ${cls}`}>{mood}</span>;
            })}
          </div>
        </div>
      )}

      {/* ── Top genres + By decade ────────────────────── */}
      <div className="td-two-col">
        {topGenres.length > 0 && (
          <div className="td-card">
            <div className="td-card-label">By genre</div>
            {topGenres.map(([label, count]) => (
              <div key={label} className="td-bar-row">
                <span className="td-bar-label">{label}</span>
                <div className="td-bar-track">
                  <div className="td-bar-fill" style={{ width: `${(count / maxGenreCount) * 100}%` }} />
                </div>
                <span className="td-bar-pct">{Math.round((count / watched.length) * 100)}%</span>
              </div>
            ))}
          </div>
        )}

        {topDecades.length > 0 && (
          <div className="td-card">
            <div className="td-card-label">By decade</div>
            {topDecades.map(([decade, count]) => (
              <div key={decade} className="td-bar-row">
                <span className="td-bar-label">{decade}</span>
                <div className="td-bar-track">
                  <div className="td-bar-fill" style={{ width: `${(count / maxDecadeCount) * 100}%` }} />
                </div>
                <span className="td-bar-pct">{count}</span>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* ── Top rated ─────────────────────────────────── */}
      {topRated.length > 0 && (
        <div className="td-card">
          <div className="td-card-label">Your top rated</div>
          {topRated.map((item, i) => (
            <div key={item.id || i} className="td-top-row" onClick={() => onItemClick(item)}>
              <span className="td-top-rank">{i + 1}</span>
              <div className="td-top-poster">
                {item.poster_path && (
                  <img src={`https://image.tmdb.org/t/p/w92${item.poster_path}`} alt={item.title || item.name} />
                )}
              </div>
              <div className="td-top-body">
                <span className="td-top-title">{item.title || item.name}</span>
                {item.mood && <span className="td-top-mood">{item.mood}</span>}
              </div>
              <span className="td-top-rating">{item.rating}/10</span>
            </div>
          ))}
        </div>
      )}

    </div>
  );
}
