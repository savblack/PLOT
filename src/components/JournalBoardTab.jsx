import { useState, useEffect, useRef } from 'react';
import { supabase } from '../api/supabase';

export default function JournalBoardTab({ watched, user, onItemClick }) {
  const [boardView, setBoardView] = useState('board'); // 'board' | 'ai'
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

    const top = items.filter(i => i.rating >= 4);
    const loved = items.filter(i => i.rating === 5);

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
      parts.push(`${loved.length} ${loved.length === 1 ? 'thing has' : 'things have'} earned a perfect 5 stars.`);
    }

    if (recentTitle) {
      parts.push(`Most recently: ${recentTitle}.`);
    }

    return parts.join(' ');
  };

  const [aiLoading, setAiLoading] = useState(false);

  const generateJournal = async () => {
    setAiLoading(true);
    const layoutStyles = ['mood-clusters', 'era-grid', 'rating-galaxy', 'pure-vibes'];
    const layoutStyle = layoutStyles[currentLayoutIdx % 4];

    const apiKey = import.meta.env.VITE_GEMINI_API_KEY;
    let summary = buildSummary(watched);

    if (apiKey) {
      try {
        const top = watched.filter(i => i.rating >= 4).slice(0, 15).map(i => ({
          title: i.title || i.name, rating: i.rating, mood: i.mood,
        }));
        const prompt = `You are a brutally perceptive cultural psychologist doing a personality read based purely on someone's watch history. Like a horoscope, but actually accurate.

Their top-rated watches (title, rating /5, mood they felt): ${JSON.stringify(top)}

Write 2-3 sentences that reveal something true about WHO THIS PERSON IS — their psychology, their inner life, what they're probably like at a dinner party, what they need from stories.

Rules:
- This is a PERSONALITY read, not a taste summary — don't describe what they watch, describe what it reveals about them
- Be specific and a little daring — generic observations are worse than wrong ones
- Warm but sharp. Insightful not mean. Second person, flowing prose
- You can reference a title or two but only to make a psychological point, not to list what they watched
- End with something that feels like it sees them`;

        const res = await fetch(
          `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${apiKey}`,
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }] }),
          }
        );
        const json = await res.json();
        const text = json.candidates?.[0]?.content?.parts?.[0]?.text;
        if (text) summary = text;
      } catch {
        // fall through to rule-based summary
      }
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
            const cls = item.rating >= 5 ? 'ai-poster-lg' : item.rating >= 4 ? 'ai-poster-md' : 'ai-poster-sm';
            const width = item.rating >= 5 ? 120 : item.rating >= 4 ? 90 : 65;
            return (
              <div key={item.id || i} className={`ai-poster ${cls}`} onClick={() => onItemClick(item)}>
                {item.poster_path
                  ? <img src={`https://image.tmdb.org/t/p/w154${item.poster_path}`} alt={item.title || item.name} style={{ width }} />
                  : <div className="ai-poster-no-img" style={{ width, height: Math.round(width * 1.5) }} />
                }
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
            </div>
          );
        })}
      </div>
    );
  };

  if (watched.length === 0) {
    return (
      <div className="empty-journal-state">
        <h3>Your board is empty</h3>
        <p>Log some movies or shows to start building your board.</p>
      </div>
    );
  }

  return (
    <div>
      <div className="board-view-toggle">
        <button
          className={`board-view-pill ${boardView === 'board' ? 'active' : ''}`}
          onClick={() => setBoardView('board')}
        >Board</button>
        <button
          className={`board-view-pill ${boardView === 'ai' ? 'active' : ''}`}
          onClick={() => setBoardView('ai')}
        >Journal for me</button>
      </div>

      {boardView === 'board' && (
        <div
          ref={containerRef}
          className="board-container"
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
                  {item.rating > 0 && <span className="board-card-rating">{'★'.repeat(item.rating)}</span>}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {boardView === 'ai' && (
        <div>
          <button
            className="ai-journal-generate-btn"
            onClick={generateJournal}
            disabled={aiLoading}
          >
            {aiLoading ? 'Generating…' : aiJournal ? 'Regenerate' : 'Generate'}
          </button>

          {aiJournal?.summary && (
            <p className="ai-journal-summary">{aiJournal.summary}</p>
          )}

          {aiJournal && renderAiLayout()}

          {!aiJournal && !aiLoading && (
            <p style={{ color: 'var(--text-secondary)', fontSize: '0.9rem' }}>
              Generate a personalised taste summary and poster layout from your watch history.
            </p>
          )}
        </div>
      )}
    </div>
  );
}
