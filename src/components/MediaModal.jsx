import { useState, useEffect } from 'react';
import { tmdb } from '../api/tmdb';

export default function MediaModal({ item, onClose, onSave, savedData }) {
  const [details, setDetails] = useState(null);
  const [rating, setRating] = useState(savedData?.rating || 0);
  const [note, setNote] = useState(savedData?.note || '');
  const [providers, setProviders] = useState(null);

  useEffect(() => {
    const fetchDetails = async () => {
      const type = item.media_type || (item.title ? 'movie' : 'tv');
      const data = type === 'movie' ? await tmdb.getMovieDetails(item.id) : await tmdb.getTVDetails(item.id);
      if (data) {
        setDetails(data);
        setProviders(data['watch/providers']?.results?.AU);
      }
    };
    fetchDetails();
  }, [item]);

  const handleSave = () => {
    onSave({
      ...item,
      rating,
      note,
      type: item.media_type || (item.title ? 'movie' : 'tv'),
      updatedAt: new Date().toISOString()
    });
    onClose();
  };

  const StarRating = () => {
    return (
      <div className="star-rating">
        {[0.5, 1, 1.5, 2, 2.5, 3, 3.5, 4, 4.5, 5].map((val) => (
          <button 
            key={val} 
            className={`star-btn ${rating >= val ? 'active' : ''}`}
            onClick={() => setRating(val)}
          >
            {val}
          </button>
        ))}
      </div>
    );
  };

  if (!details) return null;

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content glass animate-in" onClick={e => e.stopPropagation()}>
        <button className="close-btn" onClick={onClose}>
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M18 6L6 18M6 6l12 12"/></svg>
        </button>
        
        <div className="modal-body">
          <div className="poster-side">
            <img src={`https://image.tmdb.org/t/p/w500${details.poster_path}`} alt={details.title || details.name} />
          </div>
          
          <div className="info-side">
            <h2 className="detail-title">{details.title || details.name}</h2>
            <p className="tagline">{details.tagline}</p>
            
            <div className="providers">
              <h3>Available Streaming (AU)</h3>
              <div className="provider-list">
                {providers.flatrate?.map(p => (
                  <div key={p.provider_id} className="provider-pill">
                    <img src={`https://image.tmdb.org/t/p/original${p.logo_path}`} title={p.provider_name} />
                    <span>{p.provider_name}</span>
                  </div>
                ))}
                {!providers.flatrate && <p className="no-providers">No local streaming discovered yet.</p>}
              </div>
            </div>

            <p className="overview">{details.overview}</p>

            <div className="user-input">
              <div className="input-group">
                <h3>Your Rating</h3>
                <StarRating />
              </div>
              
              <div className="input-group">
                <h3>Your Note</h3>
                <textarea 
                  placeholder="Draft your thoughts..."
                  value={note}
                  onChange={e => setNote(e.target.value)}
                />
              </div>
              
              <button className="save-btn" onClick={handleSave}>
                {savedData ? 'Update Entry' : 'Log Entry'}
              </button>
            </div>
          </div>
        </div>
      </div>

      <style>{`
        .modal-overlay {
          position: fixed;
          top: 0;
          left: 0;
          width: 100%;
          height: 100%;
          background: rgba(255,255,255,0.4);
          display: flex;
          justify-content: center;
          align-items: center;
          z-index: 1000;
          padding: 2rem;
          backdrop-filter: blur(8px);
        }

        .modal-content {
          max-width: 1000px;
          max-height: 90vh;
          width: 100%;
          border-radius: var(--radius-lg);
          position: relative;
          overflow: hidden;
          background: white;
          box-shadow: 0 30px 60px rgba(0,0,0,0.1);
          border: 1px solid rgba(0,0,0,0.05);
        }

        .close-btn {
          position: absolute;
          top: 1.5rem;
          right: 1.5rem;
          background: #f0f0f0;
          border: none;
          color: black;
          width: 40px;
          height: 40px;
          border-radius: 50%;
          display: flex;
          align-items: center;
          justify-content: center;
          cursor: pointer;
          z-index: 10;
          transition: var(--transition);
        }

        .close-btn:hover { background: #e0e0e0; }

        .modal-body {
          display: grid;
          grid-template-columns: 400px 1fr;
          height: 100%;
          overflow-y: auto;
        }

        .poster-side {
          padding: 2rem;
          background: #fcfcfc;
        }

        .poster-side img {
          width: 100%;
          border-radius: var(--radius-md);
          box-shadow: 0 10px 40px rgba(0,0,0,0.1);
        }

        .info-side {
          padding: 3rem;
          overflow-y: auto;
        }

        .detail-title {
          font-family: var(--font-serif);
          font-size: 3rem;
          margin-bottom: 0.5rem;
        }

        .tagline {
          color: var(--text-secondary);
          font-style: italic;
          font-size: 1.1rem;
          margin-bottom: 2rem;
        }

        .providers h3 {
          font-size: 0.9rem;
          text-transform: uppercase;
          letter-spacing: 0.1em;
          color: #999;
          margin-bottom: 1rem;
        }

        .provider-list {
          display: flex;
          flex-wrap: wrap;
          gap: 0.8rem;
          margin-bottom: 2rem;
        }

        .provider-pill {
          display: flex;
          align-items: center;
          gap: 0.6rem;
          background: #f5f5f5;
          padding: 0.4rem 0.8rem;
          border-radius: var(--radius-pill);
          font-size: 0.85rem;
          font-weight: 500;
        }

        .provider-pill img {
          width: 24px;
          height: 24px;
          border-radius: 4px;
        }

        .overview {
          font-size: 1.1rem;
          line-height: 1.7;
          color: var(--text-primary);
          margin-bottom: 3rem;
        }

        .input-group {
          margin-bottom: 2rem;
        }

        .input-group h3 {
          font-size: 1rem;
          margin-bottom: 1rem;
        }

        .star-rating {
          display: flex;
          flex-wrap: wrap;
          gap: 0.4rem;
        }

        .star-btn {
          background: #f0f0f0;
          border: none;
          padding: 0.4rem 0.8rem;
          border-radius: var(--radius-md);
          cursor: pointer;
          font-weight: 600;
          font-size: 0.85rem;
          transition: var(--transition);
        }

        .star-btn.active {
          background: black;
          color: white;
        }

        textarea {
          width: 100%;
          height: 120px;
          background: #fcfcfc;
          border: 1px solid #eee;
          padding: 1rem;
          border-radius: var(--radius-md);
          font-family: inherit;
          font-size: 1rem;
          resize: none;
          outline: none;
        }

        textarea:focus { border-color: #ccc; }

        .save-btn {
          width: 100%;
          padding: 1.2rem;
          background: black;
          color: white;
          border: none;
          font-weight: 600;
          font-size: 1rem;
          border-radius: var(--radius-pill);
          cursor: pointer;
          transition: var(--transition);
        }

        .save-btn:hover { transform: scale(0.99); opacity: 0.9; }

        @media (max-width: 900px) {
          .modal-body { grid-template-columns: 1fr; }
          .poster-side { display: none; }
          .info-side { padding: 2rem; }
        }
      `}</style>
    </div>
  );
}
