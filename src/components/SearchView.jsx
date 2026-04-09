import { useState } from 'react';

export default function SearchView({ searchResults, onItemClick }) {
  const [typeFilter, setTypeFilter] = useState('all');

  const filtered = searchResults
    .filter(item => item.media_type !== 'person')
    .filter(item => typeFilter === 'all' || item.media_type === typeFilter);

  return (
    <section className="results">
      <h2 className="section-title">Discovery</h2>
      <div className="search-filter-tabs">
        <button className={typeFilter === 'all' ? 'active' : ''} onClick={() => setTypeFilter('all')}>All</button>
        <button className={typeFilter === 'movie' ? 'active' : ''} onClick={() => setTypeFilter('movie')}>Movies</button>
        <button className={typeFilter === 'tv' ? 'active' : ''} onClick={() => setTypeFilter('tv')}>TV</button>
      </div>
      <div className="bento-grid">
        {filtered.map(item => (
          <div key={item.id} className="bento-item glass" onClick={() => onItemClick(item)}>
            {item.poster_path ? (
              <img src={`https://image.tmdb.org/t/p/w342${item.poster_path}`} alt={item.title || item.name} loading="lazy" decoding="async" />
            ) : <div className="no-image">{item.title || item.name}</div>}
            <div className="overlay">
              <h3>{item.title || item.name}</h3>
            </div>
          </div>
        ))}
      </div>

      <style>{`
        .search-filter-tabs {
          display: flex;
          gap: 0.4rem;
          margin-bottom: 1.25rem;
        }
        .search-filter-tabs button {
          padding: 0.3rem 0.9rem;
          border-radius: var(--radius-pill);
          border: 1px solid #ddd;
          background: transparent;
          font-size: 0.8rem;
          font-family: var(--font-sans);
          cursor: pointer;
          color: var(--text-secondary);
          transition: background 0.15s, border-color 0.15s, color 0.15s;
        }
        .search-filter-tabs button:hover { border-color: #999; color: var(--text-primary); }
        .search-filter-tabs button.active { background: #111; border-color: #111; color: white; }
        [data-theme="dark"] .search-filter-tabs button { border-color: #333; color: #888; }
        [data-theme="dark"] .search-filter-tabs button:hover { border-color: #666; color: #ccc; }
        [data-theme="dark"] .search-filter-tabs button.active { background: #f0f0f0; border-color: #f0f0f0; color: #111; }
      `}</style>
    </section>
  );
}
