import { useState, useEffect } from 'react';
import { tmdb } from '../api/tmdb';

export default function MediaModal({ item, onClose, onSave, savedData, userLists, listItems, onCreateList, onToggleList }) {
  const [details, setDetails] = useState(null);
  const [rating, setRating] = useState(savedData?.rating || 0);
  const [note, setNote] = useState(savedData?.note || '');
  const [providers, setProviders] = useState(null);
  const [hasSaved, setHasSaved] = useState(false);
  const [newListName, setNewListName] = useState('');
  const [showNewListInput, setShowNewListInput] = useState(false);

  useEffect(() => {
    document.body.style.overflow = 'hidden';
    const fetchDetails = async () => {
      const type = item.media_type || (item.title ? 'movie' : 'tv');
      const data = type === 'movie' ? await tmdb.getMovieDetails(item.id) : await tmdb.getTVDetails(item.id);
      if (data) {
        setDetails(data);
        setProviders(data['watch/providers']?.results?.AU || {});
      }
    };
    fetchDetails();
    return () => {
      document.body.style.overflow = 'unset';
    };
  }, [item]);

  const handleSave = () => {
    onSave({
      ...item,
      rating: rating,
      note: note,
      tmdb_id: item.id,
      media_type: item.media_type || (item.title ? 'movie' : 'tv'),
      updatedAt: new Date().toISOString()
    });
    setHasSaved(true);
    setTimeout(() => setHasSaved(false), 2000);
  };

  const StarRating = () => {
    return (
      <div className="star-rating">
        {[1, 2, 3, 4, 5].map((val) => {
          return (
            <button 
              key={val} 
              className={`star-btn ${rating >= val ? 'active' : ''}`}
              onClick={() => setRating(rating === val ? 0 : val)}
              title={`${val} stars`}
            >
              <svg 
                viewBox="0 0 24 24" 
                fill={rating >= val ? 'currentColor' : 'none'} 
                stroke="currentColor" 
                strokeWidth="0.7"
              >
                <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"/>
              </svg>
            </button>
          );
        })}
        {rating > 0 && <span className="rating-value">{rating}</span>}
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
            
            <div className="providers">
              <h3>Available Streaming</h3>
              <div className="provider-list">
                {providers?.flatrate?.map(p => (
                  <div key={p.provider_id} className="provider-pill">
                    <img src={`https://image.tmdb.org/t/p/original${p.logo_path}`} title={p.provider_name} />
                    <span>{p.provider_name}</span>
                  </div>
                ))}
                {(!providers || !providers.flatrate) && <p className="no-providers">No local streaming discovered yet.</p>}
              </div>
            </div>
          </div>
          
          <div className="info-side">
            <h2 className="detail-title">{details.title || details.name}</h2>
            <p className="tagline">{details.tagline}</p>
            

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

              <div className="input-group">
                <h3>Add to Lists</h3>
                <div className="list-selector">
                  {userLists?.map(list => {
                    const isInList = listItems.some(li => li.list_id === list.id);
                    return (
                      <button 
                        key={list.id} 
                        className={`list-pill ${isInList ? 'active' : ''}`}
                        onClick={() => onToggleList(list.id, !isInList)}
                      >
                        {list.name}
                        {isInList && <span className="check">✓</span>}
                      </button>
                    );
                  })}
                  
                  {!showNewListInput ? (
                    <button className="add-list-btn" onClick={() => setShowNewListInput(true)}>
                      + New List
                    </button>
                  ) : (
                    <div className="new-list-input">
                      <input 
                        type="text" 
                        placeholder="List name..." 
                        value={newListName}
                        autoFocus
                        onChange={e => setNewListName(e.target.value)}
                        onKeyDown={async (e) => {
                          if (e.key === 'Enter') {
                            const newList = await onCreateList(newListName);
                            if (newList) onToggleList(newList.id, true);
                            setNewListName('');
                            setShowNewListInput(false);
                          }
                        }}
                      />
                      <button onClick={async () => {
                        const newList = await onCreateList(newListName);
                        if (newList) onToggleList(newList.id, true);
                        setNewListName('');
                        setShowNewListInput(false);
                      }}>Create</button>
                    </div>
                  )}
                </div>
              </div>
              
              <button className={`save-btn ${hasSaved ? 'saved' : ''}`} onClick={handleSave}>
                {hasSaved ? '✓ Saved to Journal' : (savedData ? 'Update Entry' : 'Log Entry')}
              </button>
            </div>
          </div>
        </div>
      </div>

      <style>{`
.modal-content {
          max-width: 1000px;
          height: 90vh;
          width: 100%;
          border-radius: var(--radius-lg);
          position: relative;
          overflow: hidden;
          background: white;
          box-shadow: 0 30px 60px rgba(0,0,0,0.1);
          border: 1px solid rgba(0,0,0,0.05);
          display: flex;
          flex-direction: column;
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
          flex: 1;
          overflow: hidden; 
          min-height: 0;
        }

        .poster-side {
          padding: 2rem;
          background: #fcfcfc;
          overflow-y: auto;
          height: 100%;
        }

        .poster-side img {
          width: 100%;
          border-radius: var(--radius-md);
          box-shadow: 0 10px 40px rgba(0,0,0,0.1);
        }

        .info-side {
          padding: 3rem;
          overflow-y: auto;
          height: 100%;
          min-height: 0;
        }

        .detail-title {
          font-family: var(--font-serif);
          font-size: 2.5rem;
          margin-bottom: 0.8rem;
          line-height: 1.1;
          letter-spacing: -0.01em;
        }

        .tagline {
          color: var(--text-secondary);
          font-style: italic;
          font-size: 0.9rem;
          margin-bottom: 1rem;
        }

        .providers {
          margin-top: 1rem;
        }

        .providers h3 {
          font-size: 0.85rem;
          text-transform: uppercase;
          letter-spacing: 0.1em;
          color: black;
          margin-bottom: 0.8rem;
        }

        .provider-list {
          display: flex;
          flex-wrap: wrap;
          gap: 0.8rem;
          margin-bottom: 1rem;
        }

        .provider-pill {
          display: flex;
          align-items: center;
          gap: 0.6rem;
          background: #f5f5f5;
          padding: 0.4rem 0.8rem;
          border-radius: var(--radius-pill);
          font-size: 0.75rem;
          font-weight: 500;
        }

        .provider-pill img {
          width: 24px;
          height: 24px;
          border-radius: 4px;
        }

        .no-providers {
          font-size: 0.85rem;
          color: var(--text-secondary);
        }

        .overview {
          font-size: 0.85rem;
          line-height: 1.6;
          color: var(--text-primary);
          margin-bottom: 1.5rem;
        }

        .input-group {
          margin-bottom: 1.5rem;
        }

        .input-group h3 {
          font-size: 1rem;
          margin-bottom: 1rem;
        }

        .star-rating {
          display: flex;
          align-items: center;
          gap: 0.1rem;
        }

        .star-btn {
          background: none;
          border: none;
          padding: 0;
          cursor: pointer;
          color: #ddd;
          transition: var(--transition);
          width: 36px;
          height: 36px;
          display: flex;
          align-items: center;
          justify-content: center;
        }

        .star-btn svg {
          width: 32px;
          height: 32px;
        }

        .star-btn.active {
          color: black;
        }

        .star-btn {
          margin-right: 4px;
        }

        .rating-value {
          margin-left: 1rem;
          font-weight: 600;
          font-size: 1.1rem;
          color: black;
        }

        textarea {
          width: 100%;
          height: 120px;
          background: #fcfcfc;
          border: 1px solid #eee;
          padding: 1rem;
          border-radius: var(--radius-md);
          font-family: inherit;
          font-size: 0.85rem;
          resize: none;
          outline: none;
        }

        textarea::placeholder {
          font-size: 0.85rem;
          color: #999;
        }

        textarea:focus { border-color: #ccc; }

        .list-selector {
          display: flex;
          flex-wrap: wrap;
          gap: 0.5rem;
          margin-top: 0.5rem;
        }

        .list-pill {
          background: #f5f5f5;
          border: 1px solid transparent;
          padding: 0.5rem 1rem;
          border-radius: var(--radius-pill);
          font-size: 0.8rem;
          cursor: pointer;
          transition: var(--transition);
          display: flex;
          align-items: center;
          gap: 0.4rem;
        }

        .list-pill.active {
          background: #000;
          color: white;
        }

        .add-list-btn {
          background: none;
          border: 1px dashed #ccc;
          padding: 0.5rem 1rem;
          border-radius: var(--radius-pill);
          font-size: 0.8rem;
          cursor: pointer;
          color: #666;
        }

        .new-list-input {
          display: flex;
          gap: 0.5rem;
        }

        .new-list-input input {
          background: #f5f5f5;
          border: 1px solid #ddd;
          padding: 0.5rem 1rem;
          border-radius: var(--radius-pill);
          font-size: 0.8rem;
          outline: none;
        }

        .new-list-input button {
          background: black;
          color: white;
          border: none;
          padding: 0.5rem 1rem;
          border-radius: var(--radius-pill);
          font-size: 0.8rem;
          cursor: pointer;
        }

        .save-btn {
          width: 100%;
          padding: 1.2rem;
          background: #efefef;
          color: #666;
          border: none;
          font-weight: 500;
          font-size: 1rem;
          border-radius: var(--radius-pill);
          cursor: pointer;
          transition: var(--transition);
        }

        .save-btn:hover { transform: scale(0.99); opacity: 0.9; }
        .save-btn.saved {
          background: #4CAF50;
          pointer-events: none;
        }

        [data-theme="dark"] .modal-content {
          background: #161616;
          border-color: rgba(255,255,255,0.06);
          box-shadow: 0 30px 60px rgba(0,0,0,0.5);
        }

        [data-theme="dark"] .close-btn {
          background: #2a2a2a;
          color: #f0f0f0;
        }
        [data-theme="dark"] .close-btn:hover { background: #333; }

        [data-theme="dark"] .poster-side {
          background: #111;
        }

        [data-theme="dark"] .providers h3 {
          color: #f0f0f0;
        }

        [data-theme="dark"] .provider-pill {
          background: #2a2a2a;
          color: #f0f0f0;
        }

        [data-theme="dark"] textarea {
          background: #1e1e1e;
          border-color: #333;
          color: #f0f0f0;
        }
        [data-theme="dark"] textarea::placeholder { color: #555; }
        [data-theme="dark"] textarea:focus { border-color: #555; }

        [data-theme="dark"] .list-pill {
          background: #2a2a2a;
          color: #ccc;
        }
        [data-theme="dark"] .list-pill.active {
          background: #444;
          color: #f0f0f0;
        }

        [data-theme="dark"] .add-list-btn {
          border-color: #444;
          color: #888;
        }

        [data-theme="dark"] .new-list-input input {
          background: #2a2a2a;
          border-color: #444;
          color: #f0f0f0;
        }
        [data-theme="dark"] .new-list-input button {
          background: #444;
        }

        [data-theme="dark"] .save-btn {
          background: #2a2a2a;
          color: #aaa;
        }

        [data-theme="dark"] .star-btn.active { color: #f0f0f0; }
        [data-theme="dark"] .rating-value { color: #f0f0f0; }

        @media (max-width: 900px) {
          .modal-body { grid-template-columns: 1fr; }
          .poster-side { display: none; }
          .info-side { padding: 2rem; }
        }

        @media (max-width: 768px) {
          .info-side { padding: 1.5rem; }
          .detail-title { font-size: 1.8rem; }
          textarea { height: 80px; }
        }

        @media (max-width: 480px) {
          .modal-content { border-radius: 20px; }
          .detail-title { font-size: 1.5rem; }
        }
      `}</style>
    </div>
  );
}
