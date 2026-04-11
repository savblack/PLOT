import { useState, useEffect, useRef } from 'react';
import { supabase } from '../api/supabase';
import { GENRES } from '../constants';

export default function JournalBoardTab({ watched, user, onItemClick }) {
  const [showBoard, setShowBoard] = useState(false);
  const [positions, setPositions] = useState({});
  const [dragState, setDragState] = useState(null);
  const [isPanning, setIsPanning] = useState(false);
  const [panStart, setPanStart] = useState({ x: 0, y: 0, scrollLeft: 0, scrollTop: 0 });
  const [aiJournal, setAiJournal] = useState(null);
  const [currentLayoutIdx, setCurrentLayoutIdx] = useState(0);
  const canvasRef = useRef(null);
  const containerRef = useRef(null);
  const saveTimer = useRef(null);

  // Load saved positions on mount
  useEffect(() => {
    if (!user) return;
    supabase.from('journal_board').select('positions').eq('user_id', user.id).single()
      .then(({ data }) => {
        if (data?.positions) setPositions(data.positions);
      });
  }, [user]);

  const getPosition = (item, idx) => {
    const id = item.tmdb_id || item.id;
    if (positions[id]) return positions[id];
    const col = idx % 6;
    const row = Math.floor(idx / 6);
    return { x: 40 + col * 160, y: 40 + row * 220 };
  };

  const savePositions = (next) => {
    clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => {
      if (!user) return;
      supabase.from('journal_board').upsert({
        user_id: user.id,
        positions: next,
        updated_at: new Date().toISOString(),
      });
    }, 600);
  };

  const onCardPointerDown = (e, id, item, idx) => {
    e.stopPropagation();
    e.currentTarget.setPointerCapture(e.pointerId);
    const pos = positions[id] || getPosition(item, idx);
    setDragState({ id, startX: e.clientX, startY: e.clientY, origX: pos.x, origY: pos.y });
  };

  const onCanvasPointerMove = (e) => {
    if (dragState) {
      const dx = e.clientX - dragState.startX;
      const dy = e.clientY - dragState.startY;
      setPositions(prev => ({
        ...prev,
        [dragState.id]: { x: dragState.origX + dx, y: dragState.origY + dy },
      }));
    } else if (isPanning && containerRef.current) {
      containerRef.current.scrollLeft = panStart.scrollLeft - (e.clientX - panStart.x);
      containerRef.current.scrollTop  = panStart.scrollTop  - (e.clientY - panStart.y);
    }
  };

  const onCanvasPointerUp = () => {
    if (dragState) {
      setPositions(prev => {
        savePositions(prev);
        return prev;
      });
    }
    setDragState(null);
    setIsPanning(false);
  };

  const onCanvasPointerDown = (e) => {
    if (e.target === canvasRef.current) {
      setIsPanning(true);
      setPanStart({
        x: e.clientX,
        y: e.clientY,
        scrollLeft: containerRef.current?.scrollLeft ?? 0,
        scrollTop: containerRef.current?.scrollTop ?? 0,
      });
    }
  };

  const buildSummary = (items) => {
    if (items.length === 0) return "Nothing logged yet — start watching!";

    const top = items.filter(i => i.rating >= 8);
    const loved = items.filter(i => i.rating === 10);

    // Most common mood
    const moodCounts = {};
    items.forEach(i => { if (i.mood) moodCounts[i.mood] = (moodCounts[i.mood] || 0) + 1; });
    const topMoods = Object.entries(moodCounts).sort((a, b) => b[1] - a[1]).slice(0, 2).map(e => e[0]);

    // Movie vs TV lean
    const movieCount = items.filter(i => (i.media_type || (i.title ? 'movie' : 'tv')) === 'movie').length;
    const tvCount = items.length - movieCount;
    const mediumLean = movieCount > tvCount * 1.5 ? 'film' : tvCount > movieCount * 1.5 ? 'TV' : 'film and TV equally';

    // Top rated titles
    const topTitles = top.slice(0, 3).map(i => i.title || i.name).filter(Boolean);

    // Recency — last watched
    const recent = [...items].filter(i => i.watched_at).sort((a, b) => new Date(b.watched_at) - new Date(a.watched_at)).slice(0, 1);
    const recentTitle = recent[0] ? (recent[0].title || recent[0].name) : null;

    // Build sentences
    const parts = [];

    if (topTitles.length >= 2) {
      parts.push(`You're someone who rates ${topTitles.slice(0, 2).join(' and ')} highly — taste that leans ${mediumLean}.`);
    } else if (topTitles.length === 1) {
      parts.push(`${topTitles[0]} is a favourite — you lean toward ${mediumLean}.`);
    } else {
      parts.push(`You're building a ${mediumLean} collection.`);
    }

    if (topMoods.length >= 2) {
      parts.push(`Your mood fingerprint is mostly ${topMoods[0]} and ${topMoods[1]}.`);
    } else if (topMoods.length === 1) {
      parts.push(`You tend to watch things that leave you feeling ${topMoods[0]}.`);
    }

    if (loved.length > 0) {
      parts.push(`${loved.length} ${loved.length === 1 ? 'thing has' : 'things have'} earned a perfect 10.`);
    }

    if (recentTitle) {
      parts.push(`Most recently: ${recentTitle}.`);
    }

    return parts.join(' ');
  };

  const [aiLoading, setAiLoading] = useState(false);
  const [aiError, setAiError] = useState(null);

  const generateJournal = async () => {
    setAiLoading(true);
    setAiError(null);
    const layoutStyles = ['mood-clusters', 'era-grid', 'rating-galaxy', 'pure-vibes'];
    const layoutStyle = layoutStyles[currentLayoutIdx % 4];

    const apiKey = import.meta.env.VITE_GEMINI_API_KEY;
    let summary = null;

    if (apiKey) {
      try {
        const top = watched.filter(i => i.rating >= 4).slice(0, 15).map(i => ({
          title: i.title || i.name, rating: i.rating, mood: i.mood,
        }));
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
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }] }),
          }
        );
        const json = await res.json();
        const text = json.candidates?.[0]?.content?.parts?.[0]?.text;
        if (text) {
          summary = text;
        } else {
          const errMsg = json.error?.message || JSON.stringify(json);
          setAiError(`Gemini: ${errMsg}`);
          summary = buildSummary(watched);
        }
      } catch (err) {
        setAiError(`Request failed: ${err.message}`);
        summary = buildSummary(watched);
      }
    } else {
      setAiError('No Gemini API key found (VITE_GEMINI_API_KEY)');
      summary = buildSummary(watched);
    }

    setAiJournal({ summary, layoutStyle, items: watched.slice(0, 30) });
    setCurrentLayoutIdx(i => i + 1);
    setAiLoading(false);
  };

  // Seeded random for pure-vibes layout
  const seededRand = (seed) => {
    const x = Math.sin(seed) * 43758.5453;
    return x - Math.floor(x);
  };

  const posterOverlay = (item) => (
    <div className="ai-poster-overlay">
      {(item.release_date || item.first_air_date) && (
        <div className="ai-poster-overlay-year">{(item.release_date || item.first_air_date).slice(0, 4)}</div>
      )}
      <div className="ai-poster-overlay-title">{item.title || item.name}</div>
      {item.rating > 0 ? (
        <div className="ai-poster-overlay-rating my-rating">★ {item.rating}/10</div>
      ) : item.vote_average > 0 ? (
        <div className="ai-poster-overlay-rating">★ {item.vote_average.toFixed(1)}</div>
      ) : null}
    </div>
  );

  const renderAiLayout = () => {
    if (!aiJournal) return null;
    const { layoutStyle, items } = aiJournal;

    if (layoutStyle === 'mood-clusters') {
      const groups = {};
      items.forEach(item => {
        const key = item.mood || 'Other';
        if (!groups[key]) groups[key] = [];
        groups[key].push(item);
      });
      return (
        <div className="ai-layout-mood">
          {Object.entries(groups).map(([mood, groupItems]) => (
            <div key={mood} className="ai-mood-group">
              <div className="ai-mood-label">{mood}</div>
              <div className="ai-mood-posters">
                {groupItems.map((item, i) => (
                  <div key={item.id || i} className="ai-poster" onClick={() => onItemClick(item)}>
                    {item.poster_path
                      ? <img src={`https://image.tmdb.org/t/p/w92${item.poster_path}`} alt={item.title || item.name} />
                      : <div className="ai-poster-no-img" style={{ width: 62, height: 93 }} />
                    }
                    {posterOverlay(item)}
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      );
    }

    if (layoutStyle === 'era-grid') {
      const groups = {};
      items.forEach(item => {
        const year = item.watched_at ? new Date(item.watched_at).getFullYear() : 'Unknown';
        if (!groups[year]) groups[year] = [];
        groups[year].push(item);
      });
      return (
        <div className="ai-layout-era">
          {Object.entries(groups).sort((a, b) => b[0] - a[0]).map(([year, groupItems]) => (
            <div key={year} className="ai-era-row">
              <div className="ai-era-label">{year}</div>
              {groupItems.map((item, i) => (
                <div key={item.id || i} className="ai-poster" onClick={() => onItemClick(item)}>
                  {item.poster_path
                    ? <img src={`https://image.tmdb.org/t/p/w92${item.poster_path}`} alt={item.title || item.name} />
                    : <div className="ai-poster-no-img" style={{ width: 62, height: 93 }} />
                  }
                  {posterOverlay(item)}
                </div>
              ))}
            </div>
          ))}
        </div>
      );
    }

    if (layoutStyle === 'rating-galaxy') {
      return (
        <div className="ai-layout-rating">
          {items.map((item, i) => {
            const cls = item.rating >= 9 ? 'ai-poster-lg' : item.rating >= 7 ? 'ai-poster-md' : 'ai-poster-sm';
            const width = item.rating >= 9 ? 120 : item.rating >= 7 ? 90 : 65;
            return (
              <div key={item.id || i} className={`ai-poster ${cls}`} onClick={() => onItemClick(item)}>
                {item.poster_path
                  ? <img src={`https://image.tmdb.org/t/p/w154${item.poster_path}`} alt={item.title || item.name} style={{ width }} />
                  : <div className="ai-poster-no-img" style={{ width, height: Math.round(width * 1.5) }} />
                }
                {posterOverlay(item)}
              </div>
            );
          })}
        </div>
      );
    }

    // pure-vibes
    return (
      <div className="ai-layout-vibes">
        {items.map((item, i) => {
          const seed = (item.tmdb_id || item.id || i);
          const colSpan = seededRand(seed) > 0.8 ? 2 : 1;
          const rowSpan = seededRand(seed + 1) > 0.8 ? 2 : 1;
          return (
            <div key={item.id || i} className="ai-poster" style={{ gridColumn: `span ${colSpan}`, gridRow: `span ${rowSpan}` }} onClick={() => onItemClick(item)}>
              {item.poster_path
                ? <img src={`https://image.tmdb.org/t/p/w154${item.poster_path}`} alt={item.title || item.name} />
                : <div className="ai-poster-no-img" />
              }
              {posterOverlay(item)}
            </div>
          );
        })}
      </div>
    );
  };

  // Stats derived from watch history
  const statsTotal = watched.length;
  const ratedItems = watched.filter(i => i.rating > 0);
  const statsAvgRating = ratedItems.length > 0
    ? (ratedItems.reduce((sum, i) => sum + i.rating, 0) / ratedItems.length).toFixed(1)
    : null;
  const moodCounts = {};
  watched.forEach(i => { if (i.mood) moodCounts[i.mood] = (moodCounts[i.mood] || 0) + 1; });
  const statsTopMood = Object.entries(moodCounts).sort((a, b) => b[1] - a[1])[0]?.[0] || null;
  const movieCount = watched.filter(i => (i.media_type || (i.title ? 'movie' : 'tv')) === 'movie').length;
  const statsMoviePct = statsTotal > 0 ? Math.round((movieCount / statsTotal) * 100) : null;

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
  const statsTopGenre = Object.entries(genreCounts).sort((a, b) => b[1] - a[1])[0]?.[0] || null;

  if (watched.length === 0) {
    return (
      <div className="empty-journal-state">
        <h3>Nothing logged yet</h3>
        <p>Log some movies or shows to build your taste profile.</p>
      </div>
    );
  }

  return (
    <div>
      {statsTotal > 0 && (
        <div className="taste-stats-bar">
          <div className="taste-stat">
            <span className="taste-stat-value">{statsTotal}</span>
            <span className="taste-stat-label">logged</span>
          </div>
          {statsAvgRating && (
            <div className="taste-stat">
              <span className="taste-stat-value">★ {statsAvgRating}/10</span>
              <span className="taste-stat-label">avg rating</span>
            </div>
          )}
          {statsTopMood && (
            <div className="taste-stat">
              <span className="taste-stat-value">{statsTopMood}</span>
              <span className="taste-stat-label">top mood</span>
            </div>
          )}
          {statsTopGenre && (
            <div className="taste-stat">
              <span className="taste-stat-value">{statsTopGenre}</span>
              <span className="taste-stat-label">top genre</span>
            </div>
          )}
          {statsMoviePct !== null && (
            <div className="taste-stat">
              <span className="taste-stat-value">{statsMoviePct}%</span>
              <span className="taste-stat-label">films</span>
            </div>
          )}
        </div>
      )}

      <div>
        <button
          className="ai-journal-generate-btn"
          onClick={generateJournal}
          disabled={aiLoading}
        >
          {aiLoading ? 'Generating…' : aiJournal ? 'Regenerate taste profile' : 'Generate my taste profile'}
        </button>

        {aiJournal?.summary && (
          <p className="ai-journal-summary">{aiJournal.summary}</p>
        )}

        {aiJournal && renderAiLayout()}

        {!aiJournal && !aiLoading && (
          <p style={{ color: 'var(--text-secondary)', fontSize: '0.9rem', marginTop: '0.75rem' }}>
            Generate a personalised personality read and poster layout from your watch history.
          </p>
        )}
      </div>

      <div style={{ marginTop: '2rem', textAlign: 'center' }}>
        <button
          className="view-board-link"
          onClick={() => setShowBoard(v => !v)}
        >
          {showBoard ? 'Hide board' : 'View as board'}
        </button>
      </div>

      {showBoard && (
        <div
          ref={containerRef}
          className="board-container"
          style={{ marginTop: '1rem' }}
          onPointerMove={onCanvasPointerMove}
          onPointerUp={onCanvasPointerUp}
        >
          <div
            ref={canvasRef}
            className="board-canvas"
            onPointerDown={onCanvasPointerDown}
          >
            {watched.map((item, idx) => {
              const id = item.tmdb_id || item.id;
              const { x, y } = getPosition(item, idx);
              return (
                <div
                  key={id}
                  className={`board-card ${dragState?.id === id ? 'dragging' : ''}`}
                  style={{ left: x, top: y }}
                  onPointerDown={e => onCardPointerDown(e, id, item, idx)}
                  onClick={() => { if (!dragState) onItemClick(item); }}
                >
                  {item.poster_path
                    ? <img src={`https://image.tmdb.org/t/p/w154${item.poster_path}`} alt={item.title || item.name} draggable={false} />
                    : <div className="board-card-no-poster">{item.title || item.name}</div>
                  }
                  {item.rating > 0 && <span className="board-card-rating">★ {item.rating}</span>}
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
