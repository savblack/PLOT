import { useState } from 'react';
import { GENRES } from '../constants';

export default function JournalBoardTab({ watched, user, onItemClick }) {
  const [aiJournal, setAiJournal] = useState(null);
  const [aiLoading, setAiLoading] = useState(false);

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

  // Rating distribution 1–10
  const ratingDist = Array.from({ length: 10 }, (_, i) => ({
    rating: i + 1,
    count: ratedItems.filter(item => item.rating === i + 1).length,
  }));
  const maxRatingCount = Math.max(...ratingDist.map(r => r.count), 1);

  // Monthly activity — last 12 months
  const monthlyActivity = Array.from({ length: 12 }, (_, i) => {
    const d = new Date(now.getFullYear(), now.getMonth() - (11 - i), 1);
    const year = d.getFullYear();
    const month = d.getMonth();
    const count = watched.filter(item => {
      if (!item.watched_at) return false;
      const w = new Date(item.watched_at);
      return w.getFullYear() === year && w.getMonth() === month;
    }).length;
    return { month: d.toLocaleString('default', { month: 'short' }), count, isCurrent: i === 11 };
  });
  const maxMonthCount = Math.max(...monthlyActivity.map(m => m.count), 1);
  const peakMonth = [...monthlyActivity].sort((a, b) => b.count - a.count)[0];

  // Top rated
  const topRated = [...ratedItems]
    .sort((a, b) => b.rating - a.rating || new Date(b.watched_at || 0) - new Date(a.watched_at || 0))
    .slice(0, 5);

  // ── AI generation ──────────────────────────────────────
  const buildFallback = () => {
    const top = watched.filter(i => i.rating >= 8);
    const topTitles = top.slice(0, 2).map(i => i.title || i.name).filter(Boolean);
    const lean = movieCount > tvCount * 1.5 ? 'film' : tvCount > movieCount * 1.5 ? 'TV' : 'film and TV equally';
    const parts = [];
    if (topTitles.length >= 2) parts.push(`You rate ${topTitles.join(' and ')} highly — taste that leans ${lean}.`);
    if (topMoods[0]) parts.push(`Your mood fingerprint is mostly ${topMoods[0][0]}${topMoods[1] ? ` and ${topMoods[1][0]}` : ''}.`);
    if (perfect10s.length) parts.push(`${perfect10s.length} ${perfect10s.length === 1 ? 'thing has' : 'things have'} earned a perfect 10.`);
    return parts.join(' ') || 'Log more films and shows to generate your taste profile.';
  };

  const generateProfile = async () => {
    setAiLoading(true);
    const apiKey = import.meta.env.VITE_GEMINI_API_KEY;
    let summary = null;

    if (apiKey) {
      try {
        const top = ratedItems.slice(0, 15).map(i => ({ title: i.title || i.name, rating: i.rating, mood: i.mood }));
        const prompt = `You are a brutally perceptive cultural psychologist doing a personality read based purely on someone's watch history. Like a horoscope, but actually accurate.

Their top-rated watches (title, rating /10, mood they felt): ${JSON.stringify(top)}

Write 2-3 sentences that reveal something true about WHO THIS PERSON IS — their psychology, their inner life, what they're probably like at a dinner party, what they need from stories.

Rules:
- This is a PERSONALITY read, not a taste summary — don't describe what they watch, describe what it reveals about them
- Be specific and a little daring — generic observations are worse than wrong ones
- Warm but sharp. Insightful not mean. Second person, flowing prose
- You can reference a title or two but only to make a psychological point, not to list what they watched
- End with something that feels like it sees them`;

        const res = await fetch(
          `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${apiKey}`,
          { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }] }) }
        );
        const json = await res.json();
        summary = json.candidates?.[0]?.content?.parts?.[0]?.text || buildFallback();
      } catch {
        summary = buildFallback();
      }
    } else {
      summary = buildFallback();
    }

    setAiJournal(summary);
    setAiLoading(false);
  };

  if (watched.length === 0) {
    return (
      <div className="empty-journal-state">
        <h3>Nothing logged yet</h3>
        <p>Log some movies or shows to build your taste profile.</p>
      </div>
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
          <span className="td-hero-num td-hero-num-lg">
            {thisYearCount > 0 ? thisYearCount : watched.length}
          </span>
          {thisYearCount > 0 && lastYearCount > 0 && (
            <span className="td-hero-sub">
              {yearDelta >= 0 ? `↑ ${yearDelta}` : `↓ ${Math.abs(yearDelta)}`} vs {lastYear}
            </span>
          )}
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

      {/* ── Genre + Mood row ─────────────────────────── */}
      <div className="td-two-col">
        {topGenres.length > 0 && (
          <div className="td-card">
            <div className="td-card-label">Top genres</div>
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

        <div className="td-card">
          {topMoods.length > 0 && (
            <>
              <div className="td-card-label">Mood fingerprint</div>
              <div className="td-mood-cloud">
                {topMoods.slice(0, 8).map(([mood, count]) => {
                  const ratio = count / maxMoodCount;
                  const cls = ratio > 0.7 ? 'td-mood-lg' : ratio > 0.4 ? 'td-mood-md' : 'td-mood-sm';
                  return <span key={mood} className={`td-mood-chip ${cls}`}>{mood}</span>;
                })}
              </div>
            </>
          )}

          <div className="td-films-tv">
            <div className="td-card-label" style={{ marginTop: topMoods.length ? '1rem' : 0 }}>Films vs TV</div>
            <div className="td-ft-bar">
              <div className="td-ft-fill" style={{ width: `${moviePct}%` }} />
            </div>
            <div className="td-ft-labels">
              <span style={{ fontWeight: 500 }}>Films {moviePct}%</span>
              <span style={{ color: 'var(--text-secondary)' }}>TV {100 - moviePct}%</span>
            </div>
          </div>
        </div>
      </div>

      {/* ── Rating dist + Monthly activity ───────────── */}
      <div className="td-two-col">
        {ratedItems.length > 0 && (
          <div className="td-card">
            <div className="td-card-label">Rating distribution</div>
            <div className="td-rdist">
              {ratingDist.map(({ rating, count }) => (
                <div
                  key={rating}
                  className="td-rdist-bar"
                  style={{ height: `${Math.max((count / maxRatingCount) * 100, count > 0 ? 4 : 0)}%` }}
                  title={`${rating}/10 — ${count} title${count !== 1 ? 's' : ''}`}
                />
              ))}
            </div>
            <div className="td-rdist-labels">
              {ratingDist.map(({ rating }) => (
                <span key={rating}>{rating}</span>
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
          <div className="td-sparkline">
            {monthlyActivity.map(({ month, count, isCurrent }) => (
              <div
                key={month + isCurrent}
                className={`td-spark-bar${isCurrent ? ' current' : ''}`}
                style={{ height: `${Math.max((count / maxMonthCount) * 100, count > 0 ? 4 : 0)}%` }}
                title={`${month} — ${count} title${count !== 1 ? 's' : ''}`}
              />
            ))}
          </div>
          <div className="td-spark-labels">
            {monthlyActivity.map(({ month, isCurrent }) => (
              <span key={month + isCurrent} className={isCurrent ? 'current' : ''}>{month[0]}</span>
            ))}
          </div>
          {peakMonth?.count > 0 && (
            <div className="td-rdist-sub">
              Most active: {peakMonth.month} · {peakMonth.count} title{peakMonth.count !== 1 ? 's' : ''}
            </div>
          )}
        </div>
      </div>

      {/* ── AI personality card ───────────────────────── */}
      <div className="td-ai-card">
        <div className="td-ai-eyebrow">AI personality read</div>
        {aiJournal ? (
          <>
            <p className="td-ai-text">{aiJournal}</p>
            <button className="td-ai-btn" onClick={generateProfile} disabled={aiLoading}>
              {aiLoading ? 'Generating…' : 'Regenerate'}
            </button>
          </>
        ) : (
          <div className="td-ai-empty">
            <p className="td-ai-empty-sub">
              A personalised personality read based on what you watch and how you rate it.
            </p>
            <button className="td-ai-btn" onClick={generateProfile} disabled={aiLoading}>
              {aiLoading ? 'Generating…' : 'Generate my taste profile'}
            </button>
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
