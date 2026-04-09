import { useState, useEffect, useRef, useCallback } from 'react';
import { tmdb } from '../../api/tmdb';
import ImportModal from '../../components/ImportModal';

export default function StepSeedTitles({ seedTitles, onToggleSeedTitle, user }) {
  const [seedQuery, setSeedQuery] = useState('');
  const [seedResults, setSeedResults] = useState([]);
  const [searching, setSearching] = useState(false);
  const [showImportModal, setShowImportModal] = useState(false);

  const chipsScrollRef = useRef(null);
  const [chipsScroll, setChipsScroll] = useState({ left: false, right: false });
  const resultsScrollRef = useRef(null);
  const [resultsScrolled, setResultsScrolled] = useState(false);

  const updateChipsScroll = useCallback(() => {
    const el = chipsScrollRef.current;
    if (!el) return;
    setChipsScroll({
      left: el.scrollLeft > 0,
      right: el.scrollLeft < el.scrollWidth - el.clientWidth - 1,
    });
  }, []);

  const updateResultsScroll = useCallback(() => {
    const el = resultsScrollRef.current;
    if (!el) return;
    setResultsScrolled(el.scrollTop > 0);
  }, []);

  useEffect(() => {
    updateChipsScroll();
  }, [seedTitles]);

  useEffect(() => {
    setResultsScrolled(false);
  }, [seedResults]);

  useEffect(() => {
    if (!seedQuery.trim()) { setSeedResults([]); return; }
    const timer = setTimeout(async () => {
      setSearching(true);
      const data = await tmdb.search(seedQuery);
      if (data?.results) {
        setSeedResults(
          data.results
            .filter(r => (r.media_type === 'movie' || r.media_type === 'tv') && r.poster_path)
            .slice(0, 6)
        );
      }
      setSearching(false);
    }, 400);
    return () => clearTimeout(timer);
  }, [seedQuery]);

  return (
    <div>
      <h1 className="onboarding-step-heading">What have you loved lately?</h1>
      <p className="onboarding-step-sub">
        A few favourites tell us everything.
      </p>

      {seedTitles.length > 0 && (
        <div className={`onboarding-seeds-chips-wrap${chipsScroll.left ? ' show-left-fade' : ''}${chipsScroll.right ? ' show-right-fade' : ''}`}>
          <div className="onboarding-seeds-chips" ref={chipsScrollRef} onScroll={updateChipsScroll}>
            {seedTitles.map(t => (
              <div key={t.id} className="onboarding-seed-chip">
                {t.title}
                <button onClick={() => onToggleSeedTitle(t)} aria-label="Remove">×</button>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="onboarding-search-wrap">
        <svg className="onboarding-search-icon" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
          <circle cx="11" cy="11" r="8" /><path d="M21 21l-4.35-4.35" />
        </svg>
        <input
          className="onboarding-search-input"
          type="text"
          placeholder="Search for a movie or show…"
          value={seedQuery}
          autoFocus
          onChange={e => setSeedQuery(e.target.value)}
        />
      </div>

      <button
        className="onboarding-skip-link"
        onClick={() => setShowImportModal(true)}
      >
        Or import your watch history
      </button>

      {searching && (
        <div className="onboarding-seed-loading">
          <div className="onboarding-spinner-dark" />
        </div>
      )}

      {!searching && seedResults.length > 0 && (
        <div className={`onboarding-seed-results-wrap${resultsScrolled ? ' show-top-fade' : ''}`}>
          <div className="onboarding-seed-results" ref={resultsScrollRef} onScroll={updateResultsScroll}>
            {seedResults.map(item => {
              const isSelected = seedTitles.some(t => t.id === item.id);
              return (
                <button
                  key={item.id}
                  className={`onboarding-seed-result${isSelected ? ' selected' : ''}`}
                  onClick={() => onToggleSeedTitle(item)}
                >
                  {item.poster_path ? (
                    <img
                      className="onboarding-seed-poster"
                      src={`https://image.tmdb.org/t/p/w92${item.poster_path}`}
                      alt={item.title || item.name}
                    />
                  ) : (
                    <div className="onboarding-seed-poster-placeholder" />
                  )}
                  <div className="onboarding-seed-info">
                    <div className="onboarding-seed-title">{item.title || item.name}</div>
                    <div className="onboarding-seed-meta">
                      {item.media_type === 'tv' ? 'TV Series' : 'Movie'}
                      {(item.release_date || item.first_air_date)
                        ? ` · ${(item.release_date || item.first_air_date).slice(0, 4)}`
                        : ''
                      }
                    </div>
                  </div>
                  <div className="onboarding-seed-check">
                    {isSelected && (
                      <svg width="10" height="10" viewBox="0 0 12 12" fill="none" stroke="#fff" strokeWidth="2" strokeLinecap="round">
                        <polyline points="1.5 6 4.5 9 10.5 3" />
                      </svg>
                    )}
                  </div>
                </button>
              );
            })}
          </div>
        </div>
      )}

      {showImportModal && (
        <ImportModal
          user={user}
          onClose={() => setShowImportModal(false)}
          onImported={() => setShowImportModal(false)}
        />
      )}
    </div>
  );
}
