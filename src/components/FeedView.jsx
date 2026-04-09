import { useState, useEffect } from 'react';
import { GENRES } from '../constants.js';
import { tmdb } from '../api/tmdb';
import LoadingSpinner from './LoadingSpinner';

export default function FeedView({
  feedTab, setFeedTab,
  forYouFeed, trending, followingFeed, followingLoading,
  mediaFilter, setMediaFilter, feedLayout,
  preferences, user,
  getSavedData, onItemClick, onNavigateToProfile,
}) {
  const [selectedGenre, setSelectedGenre] = useState(null);
  const [browseType, setBrowseType] = useState('movie');
  const [browseResults, setBrowseResults] = useState([]);
  const [browseLoading, setBrowseLoading] = useState(false);

  useEffect(() => {
    if (feedTab !== 'browse' || !selectedGenre) return;
    const genreId = browseType === 'movie' ? selectedGenre.movieId : selectedGenre.tvId;
    if (!genreId) return;
    setBrowseLoading(true);
    tmdb.discoverByGenres(browseType, [genreId]).then(data => {
      setBrowseResults((data?.results || []).map(i => ({ ...i, media_type: browseType })));
      setBrowseLoading(false);
    });
  }, [selectedGenre, browseType, feedTab]);

  const activeItems = feedTab === 'trending' ? trending
    : feedTab === 'following' ? followingFeed
    : forYouFeed;

  return (
    <section>
      <div className="section-header-row">
        <h2 className="section-title">Feed</h2>
        {feedTab !== 'browse' && (
          <div className="mobile-filter-row">
            <button className={mediaFilter === 'movie' ? 'active' : ''} onClick={() => setMediaFilter('movie')}>Movies</button>
            <button className={mediaFilter === 'tv' ? 'active' : ''} onClick={() => setMediaFilter('tv')}>TV</button>
          </div>
        )}
      </div>
      <div className="journal-tab-nav">
        <button className={`journal-tab-btn ${feedTab === 'foryou' ? 'active' : ''}`} onClick={() => setFeedTab('foryou')}>For You</button>
        <button className={`journal-tab-btn ${feedTab === 'trending' ? 'active' : ''}`} onClick={() => setFeedTab('trending')}>Trending</button>
        {user && <button className={`journal-tab-btn ${feedTab === 'following' ? 'active' : ''}`} onClick={() => setFeedTab('following')}>Following</button>}
        <button className={`journal-tab-btn ${feedTab === 'browse' ? 'active' : ''}`} onClick={() => setFeedTab('browse')}>Browse</button>
      </div>

      {feedTab === 'browse' ? (
        <div className="browse-tab">
          <div className="browse-controls">
            <div className="genre-pill-row">
              {GENRES.map(g => (
                <button
                  key={g.key}
                  className={`genre-pill ${selectedGenre?.key === g.key ? 'active' : ''}`}
                  onClick={() => setSelectedGenre(selectedGenre?.key === g.key ? null : g)}
                >
                  {g.label}
                </button>
              ))}
            </div>
            <div className="browse-type-toggle">
              <button className={browseType === 'movie' ? 'active' : ''} onClick={() => setBrowseType('movie')}>Movies</button>
              <button className={browseType === 'tv' ? 'active' : ''} onClick={() => setBrowseType('tv')}>TV</button>
            </div>
          </div>

          {!selectedGenre ? (
            <p className="browse-empty-state">Pick a genre to explore.</p>
          ) : browseLoading ? (
            <LoadingSpinner />
          ) : (
            <div className="bento-grid">
              {browseResults.map((item, index) => (
                <div
                  key={`${item.id}-${index}`}
                  className={`bento-item glass ${feedLayout === 'bento' && index % 5 === 0 ? 'large' : ''}`}
                  onClick={() => onItemClick(item)}
                >
                  {item.poster_path
                    ? <img src={`https://image.tmdb.org/t/p/w342${item.poster_path}`} alt={item.title || item.name} loading="lazy" decoding="async" />
                    : <div className="no-image">{item.title || item.name}</div>
                  }
                  <div className="overlay">
                    <h3>{item.title || item.name}</h3>
                    {getSavedData(item.id) && <span className="watched-dot" />}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      ) : (
        <>
          {feedTab === 'foryou' && forYouFeed.length === 0 && preferences.genres.length > 0 && <LoadingSpinner />}
          {feedTab === 'trending' && trending.length === 0 && <LoadingSpinner />}
          {feedTab === 'following' && followingLoading && <LoadingSpinner />}

          {feedTab === 'following' && !followingLoading && followingFeed.length === 0 ? (
            <p className="feed-empty-state">Follow people to see what they're watching.</p>
          ) : (
            <div className="bento-grid">
              {(feedTab === 'following' ? activeItems : activeItems.filter(item =>
                (item.media_type || (item.title ? 'movie' : 'tv')) === mediaFilter
              )).map((item, index) => (
                <div
                  key={`${item.id}-${index}`}
                  className={`bento-item glass ${feedLayout === 'bento' && index % 5 === 0 ? 'large' : ''}`}
                  onClick={() => onItemClick(item)}
                >
                  {item.poster_path
                    ? <img src={`https://image.tmdb.org/t/p/w342${item.poster_path}`} alt={item.title || item.name} loading="lazy" decoding="async" />
                    : <div className="no-image">{item.title || item.name}</div>
                  }
                  <div className="overlay">
                    <h3>{item.title || item.name}</h3>
                    {getSavedData(item.id) && <span className="watched-dot" />}
                  </div>
                  {item.profile && (
                    <button
                      className="feed-user-chip"
                      onClick={e => { e.stopPropagation(); onNavigateToProfile(item.profile.username); }}
                    >
                      @{item.profile.username}
                    </button>
                  )}
                </div>
              ))}
            </div>
          )}
        </>
      )}

      <style>{`
        .browse-tab { }
        .browse-controls {
          display: flex;
          flex-direction: column;
          gap: 0.75rem;
          margin-bottom: 1.5rem;
        }
        .genre-pill-row {
          display: flex;
          flex-wrap: wrap;
          gap: 0.4rem;
        }
        .genre-pill {
          padding: 0.35rem 0.85rem;
          border-radius: var(--radius-pill);
          border: 1px solid #ddd;
          background: transparent;
          font-size: 0.8rem;
          font-family: var(--font-sans);
          cursor: pointer;
          transition: background 0.15s, border-color 0.15s, color 0.15s;
          color: var(--text-secondary);
        }
        .genre-pill:hover { border-color: #999; color: var(--text-primary); }
        .genre-pill.active { background: #111; border-color: #111; color: white; }
        [data-theme="dark"] .genre-pill { border-color: #333; color: #888; }
        [data-theme="dark"] .genre-pill:hover { border-color: #666; color: #ccc; }
        [data-theme="dark"] .genre-pill.active { background: #f0f0f0; border-color: #f0f0f0; color: #111; }
        .browse-type-toggle {
          display: flex;
          gap: 0;
          border: 1px solid #e0e0e0;
          border-radius: var(--radius-pill);
          overflow: hidden;
          width: fit-content;
        }
        .browse-type-toggle button {
          padding: 0.3rem 1rem;
          background: transparent;
          border: none;
          font-size: 0.78rem;
          font-family: var(--font-sans);
          cursor: pointer;
          color: var(--text-secondary);
          transition: background 0.15s, color 0.15s;
        }
        .browse-type-toggle button.active { background: #111; color: white; }
        [data-theme="dark"] .browse-type-toggle { border-color: #333; }
        [data-theme="dark"] .browse-type-toggle button.active { background: #f0f0f0; color: #111; }
        .browse-empty-state {
          color: var(--text-secondary);
          font-size: 0.9rem;
          margin-top: 2rem;
          text-align: center;
        }
      `}</style>
    </section>
  );
}
