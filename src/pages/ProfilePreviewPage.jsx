/**
 * TEMPORARY PREVIEW PAGE — delete when done reviewing
 * Visit: /profile-preview
 */
import { useState, useEffect } from 'react';
import { tmdb } from '../api/tmdb';

const MOCK_NOTES = [
  { rating: 5, mood: 'Unsettled',  note: 'The ending destroyed me. Watched it twice in one sitting.' },
  { rating: 5, mood: 'Emotional',  note: 'Absolutely floored. Three hours felt like one.' },
  { rating: 4, mood: 'Thoughtful', note: null },
  { rating: 5, mood: 'Weird',      note: 'I cried. At a blockbuster. Multiple times.' },
  { rating: 5, mood: 'Gripped',    note: null },
  { rating: 3, mood: 'Melancholy', note: 'Beautiful but the ending got me.' },
  { rating: 4, mood: 'Pensive',    note: null },
  { rating: 5, mood: 'Gripped',    note: 'Best ensemble cast I\'ve seen in years.' },
];

export default function ProfilePreviewPage() {
  const [watchIdx, setWatchIdx] = useState(0);
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    tmdb.getTrending('all', 'week').then(data => {
      const results = (data?.results ?? []).filter(r => r.poster_path);
      setItems(results.slice(0, 24));
      setLoading(false);
    });
  }, []);

  if (loading) return (
    <div style={{ padding: '4rem', textAlign: 'center', color: 'var(--text-secondary)', fontSize: '0.9rem' }}>
      Loading preview...
    </div>
  );

  const listIds = ['a', 'b', 'c', 'd'];
  const listItems = items.slice(0, 16).map((r, i) => ({
    id: r.id,
    poster_path: r.poster_path,
    title: r.title || r.name,
    media_type: r.media_type,
    list_id: listIds[i % 4],
  }));

  const watches = items.slice(0, 8).map((r, i) => ({
    id: `w${i}`,
    poster_path: r.poster_path,
    title: r.title || r.name,
    watched_at: new Date(Date.now() - i * 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
    ...MOCK_NOTES[i % MOCK_NOTES.length],
  }));

  const lists = [
    { id: 'a', name: 'All-Time Favorites' },
    { id: 'b', name: 'Sci-Fi & Dystopia' },
    { id: 'c', name: 'Want to Watch' },
    { id: 'd', name: 'New Releases' },
  ];

  const heroPosters = listItems.slice(0, 4).map(i => i.poster_path);
  const allPosters = listItems.map(i => i.poster_path);
  const stripRaw = Array.from({ length: Math.ceil(40 / allPosters.length) }, () => allPosters).flat().slice(0, 40);
  const filmstrip = [...stripRaw, ...stripRaw];
  const recentItems = listItems.slice(0, 12);
  const w = watches[watchIdx];

  return (
    <div style={{ maxWidth: 960, margin: '0 auto', padding: '2rem 2rem 6rem' }}>

      {/* Hero */}
      <div className="pp-hero">
        <div className="pp-hero-strip">
          {heroPosters.map((p, i) => (
            <img key={i} src={`https://image.tmdb.org/t/p/w342${p}`} alt="" />
          ))}
        </div>
        <div className="pp-hero-overlay" />
        <div className="pp-profile-card">
          <div className="public-profile-avatar pp-avatar-large">S</div>
          <div>
            <h1 className="pp-display-name">Savannah</h1>
            <p className="public-profile-username">@savannah</p>
            <p className="pp-stats">4 lists · {watches.length} watched</p>
          </div>
        </div>
      </div>

      {/* Film strip marquee */}
      <div className="pp-filmstrip">
        <div className="pp-filmstrip-track">
          {filmstrip.map((p, i) => (
            <img key={i} src={`https://image.tmdb.org/t/p/w92${p}`} alt="" />
          ))}
        </div>
      </div>

      {/* Recently Watched — centered carousel */}
      <div className="pp-watches-carousel pp-section">
        <div className="pp-section-header">
          <h2 className="pp-section-title">Recently Watched</h2>
          <span className="pp-section-count">{watches.length}</span>
        </div>
        <div className="pp-carousel-stage">
          <button className="pp-carousel-arrow" onClick={() => setWatchIdx(i => Math.max(0, i - 1))} disabled={watchIdx === 0}>‹</button>
          <div className="pp-carousel-entry" key={watchIdx}>
            <div className="pp-carousel-side">
              {w.note && <p className="pp-carousel-note">{w.note}</p>}
            </div>
            <div className="pp-carousel-poster-wrap">
              <img src={`https://image.tmdb.org/t/p/w342${w.poster_path}`} alt={w.title} />
            </div>
            <div className="pp-carousel-side">
              <h3 className="pp-carousel-title">{w.title}</h3>
              {w.rating && <p className="pp-carousel-stars">{'★'.repeat(w.rating)}{'☆'.repeat(5 - w.rating)}</p>}
              <p className="pp-carousel-date">{new Date(w.watched_at).toLocaleDateString('en-US', { day: 'numeric', month: 'short', year: 'numeric' })}</p>
              {w.mood && <p className="pp-carousel-mood">{w.mood}</p>}
            </div>
          </div>
          <button className="pp-carousel-arrow" onClick={() => setWatchIdx(i => Math.min(watches.length - 1, i + 1))} disabled={watchIdx === watches.length - 1}>›</button>
        </div>
        <div className="pp-carousel-dots">
          {watches.map((_, i) => (
            <button key={i} className={`pp-carousel-dot ${i === watchIdx ? 'active' : ''}`} onClick={() => setWatchIdx(i)} />
          ))}
        </div>
      </div>

      {/* Lists */}
      <div className="pp-section">
        <div className="pp-section-header">
          <h2 className="pp-section-title">Lists</h2>
          <span className="pp-section-count">{lists.length}</span>
        </div>
        <div className="pp-lists-grid">
          {lists.map(list => {
            const lItems = listItems.filter(i => i.list_id === list.id);
            const filled = lItems.slice(0, 4);
            const empty = Math.max(0, 4 - filled.length);
            return (
              <div key={list.id} className="pp-list-mosaic">
                <div className="pp-mosaic-grid">
                  {filled.map((item, idx) => (
                    <img key={idx} src={`https://image.tmdb.org/t/p/w342${item.poster_path}`} alt="" />
                  ))}
                  {Array.from({ length: empty }).map((_, idx) => (
                    <div key={`e${idx}`} className="pp-mosaic-empty" />
                  ))}
                </div>
                <div className="stack-info">
                  <h3>{list.name}</h3>
                  <p>{lItems.length} {lItems.length === 1 ? 'item' : 'items'}</p>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Recently Added */}
      <div className="pp-section">
        <div className="pp-section-header">
          <h2 className="pp-section-title">Recently Added</h2>
          <span className="pp-section-count">{listItems.length} total</span>
        </div>
        <div className="pp-scroll-row">
          {recentItems.map(item => (
            <div key={item.id} className="pp-scroll-item">
              <img
                className="pp-scroll-poster"
                src={`https://image.tmdb.org/t/p/w342${item.poster_path}`}
                alt={item.title}
              />
              <p className="pp-scroll-label">{item.title}</p>
              <p className="pp-scroll-meta">{item.media_type === 'tv' ? 'Series' : 'Film'}</p>
            </div>
          ))}
        </div>
      </div>

      {/* Join CTA */}
      <div className="pp-join-cta">
        <p className="pp-join-tagline">Track what you watch. Share what you love.</p>
        <a href="/signup" className="pp-join-link">Join Plot →</a>
      </div>
    </div>
  );
}
