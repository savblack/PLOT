import { useState, useEffect } from 'react';
import { tmdb } from './api/tmdb';
import { supabase } from './api/supabase';
import MediaModal from './components/MediaModal';
import AuthModal from './components/AuthModal';

export default function App() {
  const [watched, setWatched] = useState([]);
  const [user, setUser] = useState(null);
  const [showAuth, setShowAuth] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState([]);
  const [trending, setTrending] = useState([]);
  const [view, setView] = useState('home'); // home, search, watchlist, suggested
  const [selectedItem, setSelectedItem] = useState(null);
  const [suggested, setSuggested] = useState([]);

  // Check user session and load local fallback
  useEffect(() => {
    const init = async () => {
      const { data: { session } } = await supabase.auth.getSession();
      setUser(session?.user || null);

      if (!session) {
        const local = localStorage.getItem('plot-watched');
        if (local) setWatched(JSON.parse(local));
      }
    };
    init();

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user || null);
    });

    return () => subscription.unsubscribe();
  }, []);

  // Sync with Supabase when user is logged in
  useEffect(() => {
    if (user) {
      const fetchJournal = async () => {
        const { data, error } = await supabase
          .from('journal')
          .select('*')
          .order('watched_at', { ascending: false });
        if (data) setWatched(data.map(i => ({ ...i, id: i.tmdb_id })));
      };
      fetchJournal();
    }
  }, [user]);

  useEffect(() => {
    const loadTrending = async () => {
      const data = await tmdb.getTrending();
      if (data) setTrending(data.results.slice(0, 10));
    };
    loadTrending();
  }, []);

  useEffect(() => {
    if (view === 'suggested') {
      const loadSuggested = async () => {
        const highRated = watched.filter(i => i.rating >= 4).slice(0, 3);
        if (highRated.length === 0) {
          const upcoming = await tmdb.getUpcoming();
          setSuggested(upcoming?.results.slice(0, 10) || []);
          return;
        }

        const allRecs = await Promise.all(
          highRated.map(item => tmdb.getRecommendations(item.type, item.id))
        );
        const results = allRecs.flatMap(r => r?.results || []).filter(r => !getSavedData(r.id));
        setSuggested([...new Set(results)].slice(0, 15));
      };
      loadSuggested();
    }
  }, [view, watched]);

  const handleSearch = async (e) => {
    e.preventDefault();
    if (!searchQuery.trim()) return;
    const data = await tmdb.search(searchQuery);
    if (data) {
      setSearchResults(data.results);
      setView('search');
    }
  };

  const saveToWatched = async (item) => {
    if (user) {
      const entry = {
        user_id: user.id,
        tmdb_id: item.id,
        media_type: item.type || (item.title ? 'movie' : 'tv'),
        title: item.title || item.name,
        poster_path: item.poster_path,
        rating: item.rating,
        note: item.note
      };

      const { data, error } = await supabase
        .from('journal')
        .upsert(entry, { onConflict: 'user_id, tmdb_id' });

      if (error) {
        console.error('Supabase Sync Error:', error);
      } else {
        // Optimistic update
        setWatched(prev => {
          const existing = prev.findIndex(i => i.id === item.id);
          if (existing > -1) {
            const update = [...prev];
            update[existing] = { ...item };
            return update;
          }
          return [{ ...item }, ...prev];
        });
      }
    } else {
      // Local fallback
      const updated = [...watched];
      const existing = updated.findIndex(i => i.id === item.id);
      if (existing > -1) {
        updated[existing] = item;
      } else {
        updated.unshift(item);
      }
      setWatched(updated);
      localStorage.setItem('plot-watched', JSON.stringify(updated));
    }
  };

  const logout = () => {
    supabase.auth.signOut();
    setWatched([]);
  };

  const getSavedData = (id) => watched.find(i => i.id === id);

  return (
    <div className="app-container">
      <header className="main-header animate-in">
        <div className="top-nav">
          <div className="menu-dot">
             <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><circle cx="12" cy="12" r="1.5"/><circle cx="6" cy="12" r="1.5"/><circle cx="18" cy="12" r="1.5"/></svg>
          </div>
          <div className="search-pill glass">
            <svg className="search-icon" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><circle cx="11" cy="11" r="8"/><path d="M21 21l-4.35-4.35"/></svg>
            <form onSubmit={handleSearch}>
              <input 
                type="text" 
                placeholder="Search movies & shows..." 
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
              />
            </form>
          </div>
          <div className="action-btns">
            {user ? (
              <button className="create-btn" onClick={logout}>Sign Out</button>
            ) : (
              <button className="create-btn" onClick={() => setShowAuth(true)}>Log In</button>
            )}
          </div>
        </div>

        <div className="branding">
          <h1 className="logo-font" onClick={() => setView('home')}>Plot</h1>
          <p className="meta-text">01 Follower · @savannahblack</p>
          <div className="profile-badge">
            <div className="avatar-group">
              <div className="avatar" style={{background: '#8da9e6'}}></div>
              <div className="add-avatar">+</div>
            </div>
          </div>
          <div className="nav-pills">
            <button onClick={() => setView('home')} className={view === 'home' ? 'active' : ''}>Feed</button>
            <button onClick={() => setView('watchlist')} className={view === 'watchlist' ? 'active' : ''}>Journal</button>
            <button onClick={() => setView('suggested')} className={view === 'suggested' ? 'active' : ''}>Curated</button>
          </div>
        </div>
      </header>

      <main className="content-grid animate-in">
        {view === 'home' && (
          <div className="bento-grid">
            {trending.map((item, index) => (
              <div 
                key={item.id} 
                className={`bento-item glass ${index % 5 === 0 ? 'large' : ''}`}
                onClick={() => setSelectedItem(item)}
              >
                <img src={`https://image.tmdb.org/t/p/w500${item.poster_path}`} alt={item.title || item.name} />
                <div className="overlay">
                  <h3>{item.title || item.name}</h3>
                  {getSavedData(item.id) && <span className="watched-dot"></span>}
                </div>
              </div>
            ))}
          </div>
        )}

        {view === 'search' && (
          <section className="results">
            <h2 className="section-title">Discovery</h2>
            <div className="bento-grid">
              {searchResults.map(item => (
                <div key={item.id} className="bento-item glass" onClick={() => setSelectedItem(item)}>
                  {item.poster_path ? (
                    <img src={`https://image.tmdb.org/t/p/w500${item.poster_path}`} alt={item.title || item.name} />
                  ) : <div className="no-image">{item.title || item.name}</div>}
                  <div className="overlay">
                    <h3>{item.title || item.name}</h3>
                  </div>
                </div>
              ))}
            </div>
          </section>
        )}

        {view === 'watchlist' && (
          <section className="watchlist">
            <h2 className="section-title">Your Journal</h2>
            <div className="bento-grid">
              {watched.map(item => (
                <div key={item.id} className="bento-item glass" onClick={() => setSelectedItem(item)}>
                  <img src={`https://image.tmdb.org/t/p/w500${item.poster_path}`} alt={item.title || item.name} />
                  <div className="overlay">
                    <span className="rating-tag">⭐ {item.rating}</span>
                    <h3>{item.title || item.name}</h3>
                  </div>
                </div>
              ))}
              {watched.length === 0 && <p className="empty">Your journal is empty. Start your first entry.</p>}
            </div>
          </section>
        )}

        {view === 'suggested' && (
          <section className="suggested">
            <h2 className="section-title">Curated</h2>
            <p className="subtitle">Handpicked recommendations for Australia</p>
            <div className="bento-grid">
              {suggested.map(item => (
                <div key={item.id} className="bento-item glass" onClick={() => setSelectedItem(item)}>
                  <img src={`https://image.tmdb.org/t/p/w500${item.poster_path}`} alt={item.title || item.name} />
                  <div className="overlay">
                    <h3>{item.title || item.name}</h3>
                  </div>
                </div>
              ))}
            </div>
          </section>
        )}
      </main>

      {selectedItem && (
        <MediaModal 
          item={selectedItem} 
          onClose={() => setSelectedItem(null)}
          onSave={saveToWatched}
          savedData={getSavedData(selectedItem.id)}
        />
      )}

      {showAuth && (
        <AuthModal 
          onClose={() => setShowAuth(false)} 
          onAuthSuccess={(u) => setUser(u)} 
        />
      )}

      <style>{`
        .app-container {
          max-width: 1400px;
          margin: 0 auto;
          padding: 1.5rem;
        }

        .main-header {
          text-align: center;
          margin-bottom: 4rem;
        }

        .top-nav {
          display: flex;
          justify-content: space-between;
          align-items: center;
          padding: 0 1rem;
          margin-bottom: 4rem;
        }

        .search-pill {
          display: flex;
          align-items: center;
          gap: 0.8rem;
          padding: 0.6rem 1.5rem;
          border-radius: var(--radius-pill);
          width: 400px;
          background: #efefef;
          border: none;
        }

        .search-pill input {
          background: none;
          border: none;
          outline: none;
          width: 100%;
          font-size: 0.95rem;
          color: var(--text-primary);
        }

        .search-icon { color: #888; }

        .create-btn {
          background: var(--accent-primary);
          color: white;
          border: none;
          padding: 0.6rem 1.5rem;
          border-radius: var(--radius-pill);
          font-weight: 600;
          cursor: pointer;
        }

        .branding {
          margin-top: 2rem;
        }

        .logo-font {
          font-family: var(--font-serif);
          font-size: 3.5rem;
          font-weight: 400;
          cursor: pointer;
          margin-bottom: 0.5rem;
        }

        .meta-text {
          color: var(--text-secondary);
          font-size: 0.9rem;
          margin-bottom: 1.5rem;
        }

        .avatar-group {
          display: flex;
          justify-content: center;
          align-items: center;
          gap: 0.5rem;
          margin-bottom: 2rem;
        }

        .avatar {
          width: 40px;
          height: 40px;
          border-radius: var(--radius-pill);
        }

        .add-avatar {
          width: 40px;
          height: 40px;
          border-radius: var(--radius-pill);
          border: 1px dashed #ccc;
          display: flex;
          align-items: center;
          justify-content: center;
          color: #999;
          cursor: pointer;
        }

        .nav-pills {
          display: inline-flex;
          background: #efefef;
          padding: 0.4rem;
          border-radius: var(--radius-pill);
          gap: 0.4rem;
        }

        .nav-pills button {
          background: none;
          border: none;
          padding: 0.6rem 2rem;
          border-radius: var(--radius-pill);
          cursor: pointer;
          font-weight: 500;
          color: var(--text-secondary);
          transition: var(--transition);
        }

        .nav-pills button.active {
          background: white;
          color: var(--text-primary);
          box-shadow: 0 4px 12px rgba(0,0,0,0.05);
        }

        .section-title {
          font-size: 2rem;
          margin-bottom: 2rem;
          text-align: center;
        }

        .bento-grid {
          display: grid;
          grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
          grid-auto-rows: 400px;
          gap: 1.5rem;
        }

        .bento-item {
          position: relative;
          border-radius: var(--radius-lg);
          overflow: hidden;
          cursor: pointer;
          border: none;
          transition: var(--transition);
        }

        .bento-item.large {
          grid-column: span 2;
          grid-row: span 1;
        }

        .bento-item img {
          width: 100%;
          height: 100%;
          object-fit: cover;
          transition: var(--transition);
        }

        .bento-item:hover {
          transform: scale(0.98);
        }

        .bento-item:hover img {
          transform: scale(1.05);
        }

        .overlay {
          position: absolute;
          bottom: 0;
          left: 0;
          right: 0;
          padding: 2rem;
          background: linear-gradient(to top, rgba(0,0,0,0.6), transparent);
          color: white;
          opacity: 0;
          transition: var(--transition);
        }

        .bento-item:hover .overlay {
          opacity: 1;
        }

        .overlay h3 {
          font-family: var(--font-serif);
          font-size: 1.4rem;
          margin: 0;
        }

        .rating-tag {
          background: white;
          color: black;
          padding: 0.2rem 0.6rem;
          border-radius: var(--radius-md);
          font-size: 0.8rem;
          font-weight: 600;
          margin-bottom: 0.5rem;
          display: inline-block;
        }

        .watched-dot {
          width: 8px;
          height: 8px;
          background: white;
          border-radius: 50%;
          position: absolute;
          top: 2rem;
          right: 2rem;
          box-shadow: 0 0 10px rgba(255,255,255,0.5);
        }

        .subtitle {
          text-align: center;
          color: var(--text-secondary);
          margin-top: -1.5rem;
          margin-bottom: 3rem;
        }

        @media (max-width: 768px) {
          .search-pill { width: 100%; }
          .logo-font { font-size: 2.5rem; }
          .bento-item.large { grid-column: span 1; }
        }
      `}</style>
    </div>
  );
}
