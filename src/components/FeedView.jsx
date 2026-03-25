import LoadingSpinner from './LoadingSpinner';

export default function FeedView({
  feedTab, setFeedTab,
  forYouFeed, trending, followingFeed,
  mediaFilter, feedLayout,
  preferences, user,
  getSavedData, onItemClick, onNavigateToProfile,
}) {
  const activeItems = feedTab === 'trending' ? trending
    : feedTab === 'following' ? followingFeed
    : forYouFeed;

  return (
    <section>
      <div className="section-header-row">
        <h2 className="section-title">Feed</h2>
      </div>
      <div className="journal-tab-nav">
        <button className={`journal-tab-btn ${feedTab === 'foryou' ? 'active' : ''}`} onClick={() => setFeedTab('foryou')}>For You</button>
        <button className={`journal-tab-btn ${feedTab === 'trending' ? 'active' : ''}`} onClick={() => setFeedTab('trending')}>Trending</button>
        {user && <button className={`journal-tab-btn ${feedTab === 'following' ? 'active' : ''}`} onClick={() => setFeedTab('following')}>Following</button>}
      </div>

      {feedTab === 'foryou' && forYouFeed.length === 0 && preferences.genres.length > 0 && <LoadingSpinner />}
      {feedTab === 'trending' && trending.length === 0 && <LoadingSpinner />}

      {feedTab === 'following' && followingFeed.length === 0 ? (
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
                ? <img src={`https://image.tmdb.org/t/p/w500${item.poster_path}`} alt={item.title || item.name} />
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
    </section>
  );
}
