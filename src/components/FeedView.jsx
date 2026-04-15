import { useState, useEffect } from 'react';
import { GENRES, MOODS } from '../constants.js';
import { tmdb } from '../api/tmdb';
import LoadingSpinner from './LoadingSpinner';
import EmptyState from './EmptyState';

const BROWSE_SORT_OPTIONS = [
  { value: 'popularity.desc', label: 'Most Popular' },
  { value: 'release_date.desc', label: 'Newest first' },
  { value: 'vote_average.desc', label: 'Top Rated' },
];

export default function FeedView({
  feedTab, setFeedTab,
  forYouFeed, trending, newReleases, newTV, followingFeed, followingLoading,
  mediaFilter, setMediaFilter, feedLayout,
  preferences, user,
  getSavedData, onItemClick, onNavigateToProfile,
}) {
  const [browseResults, setBrowseResults] = useState([]);
  const [browseLoading, setBrowseLoading] = useState(false);
  const [browseSort, setBrowseSort] = useState('popularity.desc');
  const [browseGenre, setBrowseGenre] = useState('');
  const [browseRating, setBrowseRating] = useState('');
  const [browseStatus, setBrowseStatus] = useState('');
  const [browseSearch, setBrowseSearch] = useState('');

  const [feedGenre, setFeedGenre] = useState('');
  const [feedSort, setFeedSort] = useState('');
  const [feedMood, setFeedMood] = useState('');
  const [feedRating, setFeedRating] = useState('');
  const [feedStatus, setFeedStatus] = useState('');

  useEffect(() => {
    if (feedTab !== 'browse') return;
    const effectiveType = mediaFilter === 'all' ? 'movie' : mediaFilter;
    setBrowseLoading(true);
    const genre = GENRES.find(g => g.key === browseGenre);
    const genreId = genre ? (effectiveType === 'movie' ? genre.movieId : genre.tvId) : null;
    const minRating = browseRating ? parseFloat(browseRating) : null;
    tmdb.discoverBrowse(effectiveType, { sortBy: browseSort, genreId, minRating }).then(data => {
      setBrowseResults((data?.results || []).map(i => ({ ...i, media_type: effectiveType })));
      setBrowseLoading(false);
    });
  }, [feedTab, mediaFilter, browseSort, browseGenre, browseRating]);

  const newReleasesFeed = [...(newReleases || []), ...(newTV || [])].map(i => ({
    ...i,
    media_type: i.media_type || (i.title ? 'movie' : 'tv'),
  }));

  const rawItems = feedTab === 'trending' ? trending
    : feedTab === 'new' ? newReleasesFeed
    : feedTab === 'following' ? followingFeed
    : forYouFeed;

  const activeItems = (() => {
    let items = feedTab === 'following' ? rawItems : rawItems.filter(item =>
      mediaFilter === 'all' || (item.media_type || (item.title ? 'movie' : 'tv')) === mediaFilter
    );
    if (feedGenre) {
      const genre = GENRES.find(g => g.key === feedGenre);
      if (genre) items = items.filter(i => {
        const id = (i.media_type === 'tv') ? genre.tvId : genre.movieId;
        return (i.genre_ids || []).includes(id);
      });
    }
    if (feedStatus === 'watched')   items = items.filter(i => getSavedData(i.id));
    if (feedStatus === 'unwatched') items = items.filter(i => !getSavedData(i.id));
    if (feedMood)   items = items.filter(i => getSavedData(i.id)?.mood === feedMood);
    if (feedRating) items = items.filter(i => (getSavedData(i.id)?.rating ?? 0) >= parseInt(feedRating));
    if (feedSort === 'date-desc')   items = [...items].sort((a, b) => (b.release_date || b.first_air_date || '').localeCompare(a.release_date || a.first_air_date || ''));
    if (feedSort === 'rating-desc') items = [...items].sort((a, b) => (b.vote_average || 0) - (a.vote_average || 0));
    return items;
  })();

  return (
    <section>
      <div className="section-header-row">
        <h2 className="section-title">Feed</h2>
        <div className="mobile-filter-row">
          <button className={mediaFilter === 'all' ? 'active' : ''} onClick={() => setMediaFilter('all')}>All</button>
          <button className={mediaFilter === 'movie' ? 'active' : ''} onClick={() => setMediaFilter('movie')}>Movies</button>
          <button className={mediaFilter === 'tv' ? 'active' : ''} onClick={() => setMediaFilter('tv')}>TV</button>
        </div>
      </div>
      <div className="journal-tab-nav">
        <button className={`journal-tab-btn ${feedTab === 'foryou' ? 'active' : ''}`} onClick={() => setFeedTab('foryou')}>For You</button>
        <button className={`journal-tab-btn ${feedTab === 'trending' ? 'active' : ''}`} onClick={() => setFeedTab('trending')}>Trending</button>
        <button className={`journal-tab-btn ${feedTab === 'new' ? 'active' : ''}`} onClick={() => setFeedTab('new')}>New Releases</button>
        {user && <button className={`journal-tab-btn ${feedTab === 'following' ? 'active' : ''}`} onClick={() => setFeedTab('following')}>Following</button>}
        <button className={`journal-tab-btn ${feedTab === 'browse' ? 'active' : ''}`} onClick={() => setFeedTab('browse')}>Browse</button>
      </div>


      {feedTab === 'browse' ? (
        <div className="browse-tab">
          <div className="history-filters">
            <select value={browseSort} onChange={e => setBrowseSort(e.target.value)}>
              {BROWSE_SORT_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
            </select>
            <select value={browseGenre} onChange={e => setBrowseGenre(e.target.value)}>
              <option value="">Genre</option>
              {GENRES.map(g => <option key={g.key} value={g.key}>{g.label}</option>)}
            </select>
            <select value={browseRating} onChange={e => setBrowseRating(e.target.value)}>
              <option value="">Rating</option>
              <option value="8">8+ / 10</option>
              <option value="7">7+ / 10</option>
              <option value="6">6+ / 10</option>
            </select>
            <select value={browseStatus} onChange={e => setBrowseStatus(e.target.value)}>
              <option value="">Status</option>
              <option value="unwatched">Not watched</option>
              <option value="watched">Watched</option>
            </select>
          </div>

          {browseLoading ? (
            <LoadingSpinner />
          ) : (() => {
            const searchLower = browseSearch.toLowerCase();
            const filtered = browseResults.filter(item => {
              if (searchLower && !(item.title || item.name || '').toLowerCase().includes(searchLower)) return false;
              if (browseStatus === 'watched' && !getSavedData(item.id)) return false;
              if (browseStatus === 'unwatched' && getSavedData(item.id)) return false;
              return true;
            });
            if (!filtered.length) return (
              <EmptyState
                eyebrow="No matches"
                title="Nothing fits these filters."
                description="Try clearing filters or adjusting your criteria."
                action={{
                  label: 'Clear filters',
                  onClick: () => {
                    setBrowseGenre('');
                    setBrowseRating('');
                    setBrowseStatus('');
                    setBrowseSearch('');
                  },
                }}
              />
            );
            const [featured, ...rest] = filtered;
            return (
              <div className="browse-featured-layout">
                <div className="browse-featured-main" onClick={() => onItemClick(featured)}>
                  {featured.poster_path
                    ? <img src={`https://image.tmdb.org/t/p/w780${featured.poster_path}`} alt={featured.title || featured.name} loading="lazy" decoding="async" />
                    : <div className="no-image">{featured.title || featured.name}</div>
                  }
                  <div className="browse-featured-overlay">
                    <div className="browse-featured-tag">
                      {(featured.release_date || featured.first_air_date || '').slice(0, 4)}
                    </div>
                    <div className="browse-featured-title">{featured.title || featured.name}</div>
                    <div className="browse-featured-meta">
                      {featured.vote_average ? `★ ${featured.vote_average.toFixed(1)}` : ''}
                      {getSavedData(featured.id) ? ' · Watched' : ''}
                    </div>
                  </div>
                </div>
                <div className="browse-sidebar">
                  {rest.slice(0, 18).map((item, i) => (
                    <div key={`${item.id}-${i}`} className="browse-sidebar-item" onClick={() => onItemClick(item)}>
                      <span className="browse-sidebar-rank">{i + 2}</span>
                      <div className="browse-sidebar-poster">
                        {item.poster_path
                          ? <img src={`https://image.tmdb.org/t/p/w154${item.poster_path}`} alt={item.title || item.name} loading="lazy" decoding="async" />
                          : <div className="no-image" style={{ fontSize: '0.6rem' }}>{item.title || item.name}</div>
                        }
                      </div>
                      <div className="browse-sidebar-info">
                        <div className="browse-sidebar-title">{item.title || item.name}</div>
                        <div className="browse-sidebar-meta">
                          {(item.release_date || item.first_air_date || '').slice(0, 4)}
                          {item.media_type === 'tv' ? ' · TV' : ''}
                          {getSavedData(item.id) ? ' · Watched' : ''}
                        </div>
                      </div>
                      {item.vote_average > 0 && (
                        <span className="browse-sidebar-rating">★ {item.vote_average.toFixed(1)}</span>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            );
          })()}
        </div>
      ) : (
        <>
          <div className="history-filters">
            <select value={feedGenre} onChange={e => setFeedGenre(e.target.value)}>
              <option value="">Genre</option>
              {GENRES.map(g => <option key={g.key} value={g.key}>{g.label}</option>)}
            </select>
            <select value={feedRating} onChange={e => setFeedRating(e.target.value)}>
              <option value="">Rating</option>
              {[10,9,8,7,6,5,4,3,2,1].map(r => <option key={r} value={r}>{r}/10</option>)}
            </select>
            <select value={feedSort} onChange={e => setFeedSort(e.target.value)}>
              <option value="">Sort</option>
              <option value="date-desc">Newest first</option>
              <option value="rating-desc">Top Rated</option>
            </select>
          </div>

          {feedTab === 'foryou' && forYouFeed.length === 0 && preferences.genres.length > 0 && <LoadingSpinner />}
          {feedTab === 'trending' && trending.length === 0 && <LoadingSpinner />}
          {feedTab === 'new' && newReleasesFeed.length === 0 && <LoadingSpinner />}
          {feedTab === 'following' && followingLoading && <LoadingSpinner />}

          {feedTab === 'following' && !followingLoading && followingFeed.length === 0 ? (
            <EmptyState
              eyebrow="Following · empty"
              title="Nobody to follow yet."
              description="Follow people to see what they're watching and rating."
            />
          ) : (
            <div className="bento-grid">
              {activeItems.map((item, index) => (
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
                    {(item.release_date || item.first_air_date) && (
                      <div className="overlay-year">{(item.release_date || item.first_air_date).slice(0, 4)}</div>
                    )}
                    <h3>{item.title || item.name}</h3>
                    {item.vote_average > 0 && (
                      <div className="overlay-rating">★ {item.vote_average.toFixed(1)}</div>
                    )}
                    {getSavedData(item.id) && <span className="watched-dot" />}
                    {item.fromNetwork && (
                      <span className="network-label">from your network</span>
                    )}
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
        .browse-featured-layout {
          display: grid;
          grid-template-columns: 2fr 1fr;
          gap: 1.25rem;
          height: 400px;
        }
        .browse-featured-main {
          height: 100%;
          border-radius: var(--radius-lg);
          overflow: hidden;
          position: relative;
          background: #1a1a1a;
          cursor: pointer;
        }
        .browse-featured-main img {
          width: 100%; height: 100%; object-fit: cover; object-position: top center;
          display: block; opacity: 0.85;
          transition: opacity 0.3s ease;
        }
        .browse-featured-main:hover img { opacity: 0.7; }
        .browse-featured-overlay {
          position: absolute; inset: 0;
          background: linear-gradient(to top, rgba(0,0,0,0.85) 0%, transparent 55%);
          display: flex; flex-direction: column; justify-content: flex-end;
          padding: 1.5rem;
          pointer-events: none;
        }
        .browse-featured-tag {
          font-size: 0.63rem; font-weight: 700; letter-spacing: 0.12em;
          text-transform: uppercase; color: rgba(255,255,255,0.5); margin-bottom: 0.35rem;
          font-family: var(--font-sans);
        }
        .browse-featured-title {
          font-family: var(--font-serif); font-size: 1.9rem; font-weight: 500;
          color: white; line-height: 1.1; margin-bottom: 0.4rem;
        }
        .browse-featured-meta {
          font-size: 0.72rem; color: rgba(255,255,255,0.5);
          font-family: var(--font-sans);
        }
        .browse-sidebar {
          height: 100%;
          display: flex;
          flex-direction: column;
          overflow-y: auto;
        }
        .browse-sidebar-item {
          display: flex; gap: 0.7rem; align-items: center; cursor: pointer;
          padding: 0.55rem 0; border-bottom: 1px solid var(--border-color);
        }
        .browse-sidebar-item:last-child { border-bottom: none; }
        .browse-sidebar-item:hover .browse-sidebar-title { color: var(--text-primary); }
        .browse-sidebar-rank {
          font-size: 0.7rem; font-weight: 700; color: var(--text-secondary);
          width: 16px; text-align: center; flex-shrink: 0; opacity: 0.4;
        }
        .browse-sidebar-poster {
          width: 42px; height: 63px; border-radius: 6px; overflow: hidden;
          flex-shrink: 0; background: var(--border-color);
        }
        .browse-sidebar-poster img { width: 100%; height: 100%; object-fit: cover; display: block; }
        .browse-sidebar-info { flex: 1; min-width: 0; }
        .browse-sidebar-title {
          font-size: 0.8rem; font-weight: 600; color: var(--text-primary);
          white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
          margin-bottom: 3px; transition: color 0.15s;
        }
        .browse-sidebar-meta { font-size: 0.67rem; color: var(--text-secondary); }
        .browse-sidebar-rating { font-size: 0.67rem; font-weight: 600; color: var(--text-secondary); flex-shrink: 0; }
        [data-theme="dark"] .browse-sidebar-item { border-color: #2a2a2a; }
        @media (max-width: 700px) {
          .browse-featured-layout { grid-template-columns: 1fr; }
          .browse-sidebar { max-height: none; }
        }
        .feed-refresh-btn {
          background: none;
          border: none;
          cursor: pointer;
          font-size: 1.1rem;
          color: var(--text-secondary);
          padding: 0 0 0 0.5rem;
          line-height: 1;
          vertical-align: middle;
        }
        .feed-refresh-btn:hover { color: var(--text-primary); }
        .bento-item { position: relative; }
        .dismiss-btn {
          position: absolute;
          top: 0.4rem;
          right: 0.4rem;
          background: rgba(0,0,0,0.55);
          border: none;
          color: white;
          font-size: 1rem;
          line-height: 1;
          width: 1.5rem;
          height: 1.5rem;
          border-radius: 50%;
          cursor: pointer;
          display: none;
          align-items: center;
          justify-content: center;
          z-index: 10;
        }
        .bento-item:hover .dismiss-btn { display: flex; }
        .network-label {
          display: inline-block;
          font-size: 0.65rem;
          color: #aaa;
          background: rgba(0,0,0,0.4);
          border-radius: 3px;
          padding: 0.1rem 0.3rem;
          margin-top: 0.2rem;
        }
      `}</style>
    </section>
  );
}
