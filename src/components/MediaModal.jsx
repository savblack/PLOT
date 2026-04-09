import { useState, useEffect } from 'react';
import { tmdb } from '../api/tmdb';
import { PRESET_MOODS } from '../constants';
import './MediaModal.css';

function StarRating({ rating, setRating }) {
  return (
    <div className="star-rating">
      {[1, 2, 3, 4, 5].map((val) => (
        <button
          key={val}
          className={`star-btn ${rating >= val ? 'active' : ''}`}
          onClick={() => setRating(rating === val ? 0 : val)}
          title={`${val} stars`}
        >
          <svg viewBox="0 0 24 24" fill={rating >= val ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth="1.5">
            <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"/>
          </svg>
        </button>
      ))}
      {rating > 0 && <span className="rating-value">{rating}</span>}
    </div>
  );
}

function MoodPicker({ mood, setMood }) {
  const [showMoodDropdown, setShowMoodDropdown] = useState(false);
  const [customMoods, setCustomMoods] = useState(() => {
    try { return JSON.parse(localStorage.getItem('plot-custom-moods') || '[]'); } catch { return []; }
  });
  const [customMoodInput, setCustomMoodInput] = useState('');
  const [showCustomMoodInput, setShowCustomMoodInput] = useState(false);

  const allMoods = [...PRESET_MOODS, ...customMoods];
  const selectedMood = allMoods.find(m => m.value === mood);

  const addCustomMood = () => {
    const label = customMoodInput.trim();
    if (!label) return;
    const newMood = { value: label, label };
    const updated = [...customMoods, newMood];
    setCustomMoods(updated);
    localStorage.setItem('plot-custom-moods', JSON.stringify(updated));
    setMood(label);
    setCustomMoodInput('');
    setShowCustomMoodInput(false);
    setShowMoodDropdown(false);
  };

  const closeMoodDropdown = () => {
    setShowMoodDropdown(false);
    setShowCustomMoodInput(false);
    setCustomMoodInput('');
  };

  return (
    <div className="mood-dropdown-wrapper">
      <button
        className={`mood-dropdown-trigger ${mood ? 'has-value' : ''}`}
        onClick={() => setShowMoodDropdown(v => !v)}
      >
        {selectedMood
          ? <span>{selectedMood.label}</span>
          : <span className="mood-placeholder">Select...</span>
        }
        <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
          <polyline points="6 9 12 15 18 9"/>
        </svg>
      </button>

      {showMoodDropdown && (
        <>
          <div className="mood-dropdown-backdrop" onClick={closeMoodDropdown} />
          <div className="mood-dropdown">
            {allMoods.map(m => (
              <button
                key={m.value}
                className={`mood-dropdown-item ${mood === m.value ? 'active' : ''}`}
                onClick={() => { setMood(mood === m.value ? null : m.value); setShowMoodDropdown(false); }}
              >
                <span>{m.label}</span>
                {mood === m.value && (
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                    <path d="M20 6L9 17l-5-5"/>
                  </svg>
                )}
              </button>
            ))}
            <div className="mood-dropdown-divider" />
            {!showCustomMoodInput ? (
              <button className="mood-dropdown-item mood-add-item" onClick={() => setShowCustomMoodInput(true)}>
                + Add your own
              </button>
            ) : (
              <div className="mood-custom-input">
                <input
                  type="text"
                  placeholder="e.g. Nostalgic..."
                  value={customMoodInput}
                  autoFocus
                  maxLength={30}
                  onChange={e => setCustomMoodInput(e.target.value)}
                  onKeyDown={e => {
                    if (e.key === 'Enter') addCustomMood();
                    if (e.key === 'Escape') { setShowCustomMoodInput(false); setCustomMoodInput(''); }
                  }}
                />
                <button onClick={addCustomMood}>Add</button>
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}

export default function MediaModal({ item, onClose, onSave, savedData, userLists, listItems, onCreateList, onToggleList, region = 'AU', onItemClick }) {
  const [details, setDetails] = useState(null);
  const [fetchError, setFetchError] = useState(false);
  const [rating, setRating] = useState(savedData?.rating || 0);
  const [note, setNote] = useState(savedData?.note || '');
  const [mood, setMood] = useState(savedData?.mood || null);
  const [watchStatus, setWatchStatus] = useState(savedData?.watchStatus || null);
  const [watchedAt, setWatchedAt] = useState(savedData?.watched_at || new Date().toISOString().split('T')[0]);
  const [providers, setProviders] = useState(null);
  const [hasSaved, setHasSaved] = useState(false);
  const [isClosing, setIsClosing] = useState(false);
  const [newListName, setNewListName] = useState('');
  const [showNewListInput, setShowNewListInput] = useState(false);
  const [showListDropdown, setShowListDropdown] = useState(false);
  const [activeTab, setActiveTab] = useState('details');

  const closeWithFade = () => {
    setIsClosing(true);
    setTimeout(onClose, 350);
  };

  useEffect(() => {
    document.body.style.overflow = 'hidden';
    const fetchDetails = async () => {
      try {
        const type = item.media_type || (item.title ? 'movie' : 'tv');
        const data = type === 'movie' ? await tmdb.getMovieDetails(item.id) : await tmdb.getTVDetails(item.id);
        if (data) {
          setDetails(data);
          setProviders(data['watch/providers']?.results?.[region] || {});
        } else {
          setFetchError(true);
        }
      } catch {
        setFetchError(true);
      }
    };
    fetchDetails();
    return () => { document.body.style.overflow = 'unset'; };
  }, [item]);

  const handleSave = () => {
    onSave({
      ...item,
      rating,
      note,
      mood,
      watchStatus,
      tmdb_id: item.id,
      media_type: item.media_type || (item.title ? 'movie' : 'tv'),
      watched_at: watchedAt,
      updatedAt: new Date().toISOString(),
    });
    setHasSaved(true);
    setTimeout(closeWithFade, 700);
  };

  if (!details) return (
    <div className={`modal-overlay${isClosing ? ' modal-closing' : ''}`} onClick={closeWithFade}>
      <div className="modal-loading">
        {fetchError
          ? <p style={{ color: 'var(--text-secondary)', fontSize: '0.9rem' }}>Could not load details. Please try again.</p>
          : <div className="modal-spinner" />
        }
      </div>
    </div>
  );

  return (
    <div className={`modal-overlay${isClosing ? ' modal-closing' : ''}`} onClick={closeWithFade}>
      <div className="modal-content animate-in" onClick={e => e.stopPropagation()}>
        <button className="close-btn" onClick={closeWithFade}>
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M18 6L6 18M6 6l12 12"/>
          </svg>
        </button>

        <div className="modal-body">
          <div className="info-side">
            <h2 className="detail-title">{details.title || details.name}</h2>
            <p className="tagline">{details.tagline}</p>

            <div className="tab-nav">
              <button className={`tab-btn ${activeTab === 'details' ? 'active' : ''}`} onClick={() => setActiveTab('details')}>Details</button>
              <button className={`tab-btn ${activeTab === 'log' ? 'active' : ''}`} onClick={() => setActiveTab('log')}>Log</button>
              <button className={`tab-btn ${activeTab === 'similar' ? 'active' : ''}`} onClick={() => setActiveTab('similar')}>Similar</button>
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
                        <img src={`https://image.tmdb.org/t/p/w92${p.logo_path}`} title={p.provider_name} decoding="async" />
                        <span>{p.provider_name}</span>
                      </div>
                    ))}
                    {(!providers || !providers.flatrate) && (
                      <p className="no-providers">No local streaming discovered yet.</p>
                    )}
                  </div>
                </div>
              </div>
            )}

            {activeTab === 'similar' && (
              <div className="tab-content similar-tab-content">
                {details.recommendations?.results?.length > 0 ? (
                  <div className="similar-scroll">
                    {details.recommendations.results.slice(0, 12).map(rec => (
                      <button
                        key={rec.id}
                        className="similar-card"
                        onClick={() => onItemClick && onItemClick({ ...rec, media_type: rec.media_type || (item.media_type || (item.title ? 'movie' : 'tv')) })}
                        type="button"
                      >
                        {rec.poster_path
                          ? <img src={`https://image.tmdb.org/t/p/w185${rec.poster_path}`} alt={rec.title || rec.name} loading="lazy" />
                          : <div className="similar-no-poster">{rec.title || rec.name}</div>
                        }
                        <span className="similar-title">{rec.title || rec.name}</span>
                      </button>
                    ))}
                  </div>
                ) : (
                  <p className="no-similar">No similar titles found.</p>
                )}
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
                    <StarRating rating={rating} setRating={setRating} />
                    <h3>Mood</h3>
                    <MoodPicker mood={mood} setMood={setMood} />
                  </div>
                </div>

                <div className="input-group input-group-note">
                  <div className="note-label-row">
                    <h3>Note</h3>
                    {note.length > 0 && (
                      <span className={`note-char-count ${note.length > 260 ? 'note-char-warn' : ''}`}>
                        {280 - note.length}
                      </span>
                    )}
                  </div>
                  <textarea
                    placeholder="Draft your thoughts..."
                    value={note}
                    maxLength={280}
                    onChange={e => setNote(e.target.value)}
                  />
                </div>

                <div className="input-group">
                  <div className="rating-row">
                    <h3>Date watched</h3>
                    <input
                      type="date"
                      className="date-input"
                      value={watchedAt}
                      max={new Date().toISOString().split('T')[0]}
                      onChange={e => setWatchedAt(e.target.value)}
                    />
                  </div>
                </div>

                <div className="log-action-row">
                  <button className={`save-log-btn ${hasSaved ? 'saved' : ''}`} onClick={handleSave}>
                    {hasSaved ? 'Saved' : 'Save'}
                  </button>
                  <div className="save-to-list-wrapper">
                    <button className="save-btn save-to-list-btn" onClick={() => setShowListDropdown(v => !v)}>
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                        <path d="M12 5v14M5 12h14"/>
                      </svg>
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
                                onClick={async () => { await onToggleList(list.id, !isInList); handleSave(); }}
                              >
                                <span>{list.name}</span>
                                {isInList && (
                                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                                    <path d="M20 6L9 17l-5-5"/>
                                  </svg>
                                )}
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
                                    if (newList) { await onToggleList(newList.id, true); handleSave(); }
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
                                if (newList) { await onToggleList(newList.id, true); handleSave(); }
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
    </div>
  );
}
