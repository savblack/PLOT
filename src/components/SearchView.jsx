import ShareButton from './ShareButton';

export default function SearchView({ searchResults, onItemClick }) {
  return (
    <section className="results">
      <h2 className="section-title">Discovery</h2>
      <div className="bento-grid">
        {searchResults.map(item => (
          <div key={item.id} className="bento-item glass" onClick={() => onItemClick(item)}>
            {item.poster_path ? (
              <img src={`https://image.tmdb.org/t/p/w500${item.poster_path}`} alt={item.title || item.name} />
            ) : <div className="no-image">{item.title || item.name}</div>}
            <ShareButton item={item} />
            <div className="overlay">
              <h3>{item.title || item.name}</h3>
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}
