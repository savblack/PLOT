import { useState, useEffect } from 'react';
import { tmdb } from '../api/tmdb';

export default function MediaModal({ item, onClose, onSave, savedData, userLists, listItems, onCreateList, onToggleList }) {
  const [details, setDetails] = useState(null);
  const [rating, setRating] = useState(savedData?.rating || 0);
  const [note, setNote] = useState(savedData?.note || '');
  const [mood, setMood] = useState(savedData?.mood || null);
  const [watchStatus, setWatchStatus] = useState(savedData?.watchStatus || null);
  const [providers, setProviders] = useState(null);
  const [hasSaved, setHasSaved] = useState(false);
  const [newListName, setNewListName] = useState('');
  const [showNewListInput, setShowNewListInput] = useState(false);
  const [showListDropdown, setShowListDropdown] = useState(false);
  const [activeTab, setActiveTab] = useState('details');

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

  const MOODS = [
    { value: 'happy',     emoji: '😊', label: 'Happy' },
    { value: 'emotional', emoji: '🥲', label: 'Emotional' },
    { value: 'fun',       emoji: '😂', label: 'Fun' },
    { value: 'tense',     emoji: '😬', label: 'Tense' },
    { value: 'amazing',   emoji: '🤩', label: 'Amazing' },
    { value: 'mindblown', emoji: '🤯', label: 'Mind-blown' },
  ];

  const handleSave = () => {
    onSave({
      ...item,
      rating: rating,
      note: note,
      mood: mood,
      watchStatus: watchStatus,
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
                strokeWidth="1.5"
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
          <div className="info-side">
            <h2 className="detail-title">{details.title || details.name}</h2>
            <p className="tagline">{details.tagline}</p>

            <div className="tab-nav">
              <button
                className={`tab-btn ${activeTab === 'details' ? 'active' : ''}`}
                onClick={() => setActiveTab('details')}
              >
                Details
              </button>
              <button
                className={`tab-btn ${activeTab === 'log' ? 'active' : ''}`}
                onClick={() => setActiveTab('log')}
              >
                Log
              </button>
            </div>

            {activeTab === 'details' && (
              <div className="tab-content">
                <p className="overview">{details.overview}</p>
                {(details.release_date || details.first_air_date) && (
                  <div className="input-group">
                    <h3>Release Date</h3>
                    <p className="release-date">
                      {new Date(details.release_date || details.first_air_date).toLocaleDateString('en-AU', { day: 'numeric', month: 'long', year: 'numeric' })}
                    </p>
                  </div>
                )}
                <div className="input-group">
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
            )}

            {activeTab === 'log' && (
              <div className="tab-content tab-content-log">
                <div className="input-group">
                  <h3>Status</h3>
                  <div className="watch-status-selector">
                    {['Watched', 'Binged', "Didn't Finish", 'Want to Watch'].map(s => (
                      <button
                        key={s}
                        className={`status-pill ${watchStatus === s ? 'active' : ''}`}
                        onClick={() => setWatchStatus(watchStatus === s ? null : s)}
                      >
                        {s}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="input-group">
                  <div className="rating-row">
                    <h3>Rating</h3>
                    <StarRating />
                    <h3>Mood</h3>
                    <div className="mood-selector">
                      {MOODS.map(m => (
                        <button
                          key={m.value}
                          className={`mood-btn ${mood === m.value ? 'active' : ''}`}
                          onClick={() => setMood(mood === m.value ? null : m.value)}
                          title={m.label}
                        >
                          <span className="mood-emoji">{m.emoji}</span>
                        </button>
                      ))}
                    </div>
                  </div>
                </div>

                <div className="input-group input-group-note">
                  <h3>Note</h3>
                  <textarea
                    placeholder="Draft your thoughts..."
                    value={note}
                    onChange={e => setNote(e.target.value)}
                  />
                </div>
                <div className="log-action-row">
                  <button
                    className={`save-log-btn ${hasSaved ? 'saved' : ''}`}
                    onClick={handleSave}
                  >
                    {hasSaved ? 'Saved' : 'Save'}
                  </button>
                  <div className="save-to-list-wrapper">
                    <button className="save-btn save-to-list-btn" onClick={() => setShowListDropdown(v => !v)}>
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M12 5v14M5 12h14"/></svg>
                      Add to List
                    </button>
                    {showListDropdown && (
                      <>
                        <div className="list-dropdown-backdrop" onClick={() => setShowListDropdown(false)} />
                        <div className="list-dropdown">
                          {userLists?.length > 0 && userLists.map(list => {
                            const isInList = listItems.some(li => li.list_id === list.id);
                            return (
                              <button
                                key={list.id}
                                className={`list-dropdown-item ${isInList ? 'active' : ''}`}
                                onClick={() => { onToggleList(list.id, !isInList); handleSave(); }}
                              >
                                <span>{list.name}</span>
                                {isInList && <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M20 6L9 17l-5-5"/></svg>}
                              </button>
                            );
                          })}
                          {userLists?.length > 0 && <div className="list-dropdown-divider" />}
                          {!showNewListInput ? (
                            <button className="list-dropdown-item create-item" onClick={() => setShowNewListInput(true)}>
                              + New List
                            </button>
                          ) : (
                            <div className="list-dropdown-create">
                              <input
                                type="text"
                                placeholder="List name..."
                                value={newListName}
                                autoFocus
                                onChange={e => setNewListName(e.target.value)}
                                onKeyDown={async (e) => {
                                  if (e.key === 'Enter' && newListName.trim()) {
                                    const newList = await onCreateList(newListName.trim());
                                    if (newList) { onToggleList(newList.id, true); handleSave(); }
                                    setNewListName('');
                                    setShowNewListInput(false);
                                    setShowListDropdown(false);
                                  }
                                  if (e.key === 'Escape') { setShowNewListInput(false); setNewListName(''); }
                                }}
                              />
                              <button onClick={async () => {
                                if (!newListName.trim()) return;
                                const newList = await onCreateList(newListName.trim());
                                if (newList) { onToggleList(newList.id, true); handleSave(); }
                                setNewListName('');
                                setShowNewListInput(false);
                                setShowListDropdown(false);
                              }}>Create</button>
                            </div>
                          )}
                        </div>
                      </>
                    )}
                  </div>
                </div>
              </div>
            )}
          </div>

          <div className="poster-side">
            <img src={`https://image.tmdb.org/t/p/w500${details.poster_path}`} alt={details.title || details.name} />
          </div>
        </div>
      </div>

      <style>{`
.modal-content {
          max-width: 1000px;
          max-height: calc(100vh - 4rem);
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
          grid-template-columns: 1fr 400px;
          flex: 1;
          overflow: hidden; 
          min-height: 0;
        }

        .poster-side {
          padding: 3rem 2rem 2rem;
          background: #fcfcfc;
          overflow-y: auto;
          height: 100%;
          display: flex;
          flex-direction: column;
          box-sizing: border-box;
        }

        .poster-side img {
          width: 100%;
          border-radius: var(--radius-md);
          box-shadow: 0 10px 40px rgba(0,0,0,0.1);
          margin-bottom: 0.75rem;
        }

        .info-side {
          padding: 3rem 3rem 2rem;
          overflow-y: auto;
          height: 100%;
          min-height: 0;
          display: flex;
          flex-direction: column;
          box-sizing: border-box;
        }

        .detail-title {
          font-family: var(--font-serif);
          font-size: 2.5rem;
          margin-bottom: 0.2rem;
          line-height: 1.1;
          letter-spacing: -0.01em;
        }

        .tagline {
          font-family: var(--font-serif);
          color: var(--text-secondary);
          font-style: italic;
          font-size: 0.9rem;
          margin-top: 0;
          margin-bottom: 1.5rem;
        }

        .release-date {
          font-family: var(--font-sans);
          font-size: 0.85rem;
          color: var(--text-primary);
          margin-bottom: 1.2rem;
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
          margin-bottom: 1.2rem;
        }

        .input-group h3 {
          font-size: 0.75rem;
          font-family: var(--font-sans);
          text-transform: uppercase;
          letter-spacing: 0.08em;
          color: var(--text-secondary);
          font-weight: 500;
          margin-bottom: 0.6rem;
        }

        .rating-row {
          display: flex;
          align-items: center;
          gap: 0.4rem;
        }
        .rating-row h3 { margin: 0; }

        .star-rating {
          display: flex;
          align-items: center;
          gap: 0;
        }

        .star-btn {
          background: none;
          border: none;
          padding: 0;
          cursor: pointer;
          color: #ccc;
          transition: var(--transition);
          width: 28px;
          height: 28px;
          display: flex;
          align-items: center;
          justify-content: center;
          opacity: 0.5;
        }

        .star-btn svg {
          width: 22px;
          height: 22px;
        }

        .star-btn:hover { opacity: 0.7; transform: scale(1.15); }
        .star-btn.active { color: #333; opacity: 1; transform: scale(1.15); }

        .rating-value {
          font-size: 0.8rem;
          font-weight: 600;
          color: var(--text-secondary);
        }

        textarea {
          width: 100%;
          height: 140px;
          background: #fcfcfc;
          border: 1px solid #eee;
          padding: 0.75rem 1rem;
          border-radius: var(--radius-md);
          font-family: inherit;
          font-size: 0.85rem;
          resize: none;
          outline: none;
          color: var(--text-primary);
        }

        textarea::placeholder {
          font-size: 0.85rem;
          color: #bbb;
        }

        textarea:focus { border-color: #ccc; }

        .watch-status-selector {
          display: flex;
          flex-wrap: wrap;
          gap: 0.5rem;
          margin-top: 0.5rem;
        }

        .status-pill {
          flex: 1;
          padding: 0.5rem 0.5rem;
          border-radius: var(--radius-pill);
          border: 1px dashed #ccc;
          background: transparent;
          font-size: 0.8rem;
          cursor: pointer;
          transition: var(--transition);
          color: #555;
        }

        .status-pill:hover { border-color: #999; color: #111; border-style: solid; }
        .status-pill.active { border-style: solid; border-color: #333; color: #111; background: #f5f5f5; }

        [data-theme="dark"] .status-pill { border-color: #444; color: #aaa; }
        [data-theme="dark"] .status-pill:hover { border-color: #888; color: #f0f0f0; }
        [data-theme="dark"] .status-pill.active { border-color: #ccc; color: #f0f0f0; background: #2a2a2a; }

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
          padding: 0.5rem;
          background: transparent;
          color: #333;
          border: 1px solid #ccc;
          font-weight: 500;
          font-size: 0.85rem;
          font-family: var(--font-sans);
          letter-spacing: 0.04em;
          border-radius: var(--radius-pill);
          cursor: pointer;
          transition: var(--transition);
        }

        .save-btn:hover { border-color: #999; color: #111; transform: scale(0.99); }
        .save-btn.saved { background: #4CAF50; pointer-events: none; }

        .save-to-list-btn {
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 0.4rem;
        }

        .save-to-list-wrapper {
          position: relative;
        }

        .list-dropdown-backdrop {
          position: fixed;
          inset: 0;
          z-index: 10;
        }

        .list-dropdown {
          position: absolute;
          bottom: calc(100% + 0.5rem);
          left: 0;
          right: 0;
          background: white;
          border: 1px solid #e0e0e0;
          border-radius: 14px;
          box-shadow: 0 8px 30px rgba(0,0,0,0.12);
          overflow: hidden;
          z-index: 11;
          padding: 0.4rem;
        }

        .list-dropdown-item {
          display: flex;
          align-items: center;
          justify-content: space-between;
          width: 100%;
          padding: 0.6rem 0.8rem;
          background: none;
          border: none;
          border-radius: 8px;
          font-size: 0.85rem;
          font-family: var(--font-sans);
          cursor: pointer;
          text-align: left;
          color: #333;
          transition: background 0.15s;
        }

        .list-dropdown-item:hover { background: #f5f5f5; }
        .list-dropdown-item.active { font-weight: 600; }
        .list-dropdown-item.create-item { color: #888; }
        .list-dropdown-item.create-item:hover { color: #333; background: #f5f5f5; }

        .list-dropdown-divider {
          height: 1px;
          background: #f0f0f0;
          margin: 0.3rem 0.4rem;
        }

        .list-dropdown-create {
          display: flex;
          gap: 0.4rem;
          padding: 0.4rem 0.4rem;
        }

        .list-dropdown-create input {
          flex: 1;
          padding: 0.4rem 0.9rem;
          border: 1px solid #ddd;
          border-radius: var(--radius-pill);
          font-size: 0.8rem;
          font-family: var(--font-sans);
          outline: none;
        }

        .list-dropdown-create input:focus { border-color: #aaa; }

        .list-dropdown-create button {
          padding: 0.4rem 1rem;
          background: #333;
          color: white;
          border: none;
          border-radius: var(--radius-pill);
          font-size: 0.8rem;
          font-family: var(--font-sans);
          cursor: pointer;
        }

.mood-selector {
          display: flex;
          align-items: center;
          gap: 0.1rem;
        }
        .mood-btn {
          display: flex;
          align-items: center;
          background: none;
          border: none;
          padding: 0.2rem;
          cursor: pointer;
          transition: var(--transition);
          opacity: 0.35;
          border-radius: 4px;
        }
        .mood-btn:hover { opacity: 0.7; transform: scale(1.15); }
        .mood-btn.active { opacity: 1; transform: scale(1.15); }
        .mood-emoji { font-size: 1.4rem; line-height: 1; }

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
          background: transparent;
          color: #aaa;
          border-color: #444;
        }

        [data-theme="dark"] .list-dropdown {
          background: #1e1e1e;
          border-color: #333;
          box-shadow: 0 8px 30px rgba(0,0,0,0.4);
        }
        [data-theme="dark"] .list-dropdown-item { color: #ccc; }
        [data-theme="dark"] .list-dropdown-item:hover { background: #2a2a2a; }
        [data-theme="dark"] .list-dropdown-item.create-item { color: #666; }
        [data-theme="dark"] .list-dropdown-divider { background: #2a2a2a; }
        [data-theme="dark"] .list-dropdown-create input { background: #2a2a2a; border-color: #444; color: #ccc; }
        [data-theme="dark"] .list-dropdown-create button { background: #555; }
        [data-theme="dark"] .save-btn:hover { border-color: #777; color: #f0f0f0; }

        [data-theme="dark"] .star-btn { color: #555; }
        [data-theme="dark"] .star-btn.active { color: #ccc; }
        [data-theme="dark"] .rating-value { color: #888; }

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

        .tab-nav {
          display: flex;
          gap: 0;
          border-bottom: 1px solid #eee;
          margin-bottom: 1.5rem;
        }

        .tab-btn {
          background: none;
          border: none;
          border-bottom: 2px solid transparent;
          padding: 0.5rem 1rem 0.6rem;
          font-size: 0.8rem;
          font-family: var(--font-sans);
          font-weight: 500;
          letter-spacing: 0.04em;
          color: var(--text-secondary);
          cursor: pointer;
          margin-bottom: -1px;
          transition: color 0.15s, border-color 0.15s;
        }

        .tab-btn:hover { color: var(--text-primary); }
        .tab-btn.active { color: var(--text-primary); border-bottom-color: currentColor; }

        .tab-content { }

        .tab-content-log {
          flex: 1;
          display: flex;
          flex-direction: column;
          min-height: 0;
        }

        .log-action-row {
          display: flex;
          gap: 0.5rem;
          margin-top: 0.75rem;
          flex-shrink: 0;
        }

        .log-action-row .save-log-btn {
          flex: 1;
        }

        .log-action-row .save-to-list-wrapper {
          flex: 1;
        }

        .log-action-row .save-btn {
          width: 100%;
        }

        .save-log-btn {
          padding: 0.5rem;
          background: #111;
          color: white;
          border: none;
          border-radius: var(--radius-pill);
          font-family: var(--font-sans);
          font-size: 0.85rem;
          font-weight: 500;
          cursor: pointer;
          transition: var(--transition);
        }

        .save-log-btn:hover { background: #333; }
        .save-log-btn.saved { background: #4CAF50; pointer-events: none; }

        [data-theme="dark"] .save-log-btn { background: #f0f0f0; color: #111; }
        [data-theme="dark"] .save-log-btn:hover { background: #ccc; }
        [data-theme="dark"] .save-log-btn.saved { background: #4CAF50; color: white; }

        .input-group-note {
          flex: 1;
          display: flex;
          flex-direction: column;
          min-height: 0;
        }

        .input-group-note textarea {
          flex: 1;
          height: 0;
          min-height: 80px;
        }

        [data-theme="dark"] .tab-nav { border-bottom-color: #2a2a2a; }
        [data-theme="dark"] .tab-btn { color: #666; }
        [data-theme="dark"] .tab-btn:hover { color: #ccc; }
        [data-theme="dark"] .tab-btn.active { color: #f0f0f0; }
      `}</style>
    </div>
  );
}
