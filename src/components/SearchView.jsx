export default function SearchView({ searchResults, onItemClick, mediaFilter }) {
  const filtered = searchResults
    .filter(item => item.media_type !== 'person')
    .filter(item => mediaFilter === 'all' || item.media_type === mediaFilter);

  return (
    <section className="results">
      <h2 className="section-title">Discovery</h2>
      <div className="bento-grid">
        {filtered.map(item => (
          <div key={item.id} className="bento-item glass" onClick={() => onItemClick(item)}>
            {item.poster_path ? (
              <img src={`https://image.tmdb.org/t/p/w342${item.poster_path}`} alt={item.title || item.name} loading="lazy" decoding="async" />
            ) : <div className="no-image">{item.title || item.name}</div>}
            <div className="overlay">
              {(item.release_date || item.first_air_date) && (
                <div className="overlay-year">{(item.release_date || item.first_air_date).slice(0, 4)}</div>
              )}
              <h3>{item.title || item.name}</h3>
              {item.vote_average > 0 && (
                <div className="overlay-rating">★ {item.vote_average.toFixed(1)}</div>
              )}
            </div>
          </div>
        ))}
      </div>

    </section>
  );
}
