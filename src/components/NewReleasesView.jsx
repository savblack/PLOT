import LoadingSpinner from './LoadingSpinner';

export default function NewReleasesView({
  newReleasesTab, setNewReleasesTab,
  mediaFilter, feedLayout,
  newReleases, newTV,
  streamingMovies, streamingTV,
  getSavedData, onItemClick,
}) {
  const streamingSource = mediaFilter === 'movie' ? streamingMovies : streamingTV;
  const combined = (newReleasesTab === 'streaming' ? streamingSource : (mediaFilter === 'movie' ? newReleases : newTV))
    .slice()
    .sort((a, b) => b.popularity - a.popularity);

  const filtered =
    newReleasesTab === 'popular' ? combined.filter(i => i.vote_average >= 7.0) :
    combined;

  if (combined.length === 0) return (
    <section>
      <div className="section-header-row">
        <h2 className="section-title">New Releases</h2>
      </div>
      <LoadingSpinner />
    </section>
  );

  return (
    <section>
      <div className="section-header-row">
        <h2 className="section-title">New Releases</h2>
      </div>
      <div className="journal-tab-nav">
        <button className={`journal-tab-btn ${newReleasesTab === 'all' ? 'active' : ''}`} onClick={() => setNewReleasesTab('all')}>All</button>
        <button className={`journal-tab-btn ${newReleasesTab === 'popular' ? 'active' : ''}`} onClick={() => setNewReleasesTab('popular')}>Popular</button>
        <button className={`journal-tab-btn ${newReleasesTab === 'streaming' ? 'active' : ''}`} onClick={() => setNewReleasesTab('streaming')}>Now Streaming</button>
      </div>
      <div className="bento-grid">
        {filtered.map((item, index) => (
          <div
            key={item.id}
            className={`bento-item glass ${feedLayout === 'bento' && index === 0 ? 'large' : ''}`}
            onClick={() => onItemClick(item)}
          >
            {item.poster_path
              ? <img src={`https://image.tmdb.org/t/p/w342${item.poster_path}`} alt={item.title || item.name} loading="lazy" decoding="async" />
              : <div className="no-image">{item.title || item.name}</div>
            }
            {newReleasesTab === 'streaming' && item.provider && (
              <div className="provider-badge">
                <img className="provider-logo" src={item.provider.logo} alt={item.provider.name} />
              </div>
            )}
            {newReleasesTab === 'popular' && (
              <div className="rank-badge">#{index + 1}</div>
            )}
            <div className="overlay">
              <h3>{item.title || item.name}</h3>
              {getSavedData(item.id) && <span className="watched-dot"></span>}
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}
