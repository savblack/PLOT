import { useState, useEffect } from 'react';
import { tmdb } from '../../api/tmdb';

export default function StepProviders({ selectedRegion, selectedProviders, onToggleProvider }) {
  const [providers, setProviders] = useState([]);
  const [allProviders, setAllProviders] = useState([]);
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState('');
  const [searchResults, setSearchResults] = useState([]);

  useEffect(() => {
    if (providers.length > 0 || loading) return;
    const fetchProviders = async () => {
      setLoading(true);
      const data = await tmdb.getWatchProvidersForRegion('movie', selectedRegion);
      if (data?.results) {
        const sorted = [...data.results].sort((a, b) => a.display_priority - b.display_priority);
        setProviders(sorted.slice(0, 12));
        setAllProviders(sorted);
      }
      setLoading(false);
    };
    fetchProviders();
  }, []);

  useEffect(() => {
    if (!search.trim()) { setSearchResults([]); return; }
    const q = search.toLowerCase();
    setSearchResults(
      allProviders
        .filter(p => !providers.some(top => top.provider_id === p.provider_id))
        .filter(p => p.provider_name.toLowerCase().includes(q))
        .slice(0, 6)
    );
  }, [search, allProviders]);

  return (
    <div>
      <h1 className="onboarding-step-heading">What are you subscribed to?</h1>
      <p className="onboarding-step-sub">
        Your subscriptions shape your feed and help us suggest what to try next.
      </p>
      {loading && (
        <div className="onboarding-providers-loading">
          <div className="onboarding-spinner-dark" />
          Loading providers…
        </div>
      )}
      {!loading && providers.length === 0 && (
        <p className="onboarding-providers-empty">
          No providers found for your region — you can skip this step.
        </p>
      )}
      {!loading && providers.length > 0 && (
        <>
          <div className="onboarding-provider-grid">
            {providers.map(p => {
              const isSelected = selectedProviders.some(x => x.id === p.provider_id);
              return (
                <button
                  key={p.provider_id}
                  className={`onboarding-provider-card${isSelected ? ' selected' : ''}`}
                  onClick={() => onToggleProvider(p)}
                >
                  <img
                    className="onboarding-provider-logo"
                    src={`https://image.tmdb.org/t/p/w92${p.logo_path}`}
                    alt={p.provider_name}
                  />
                  <span className="onboarding-provider-name">{p.provider_name}</span>
                </button>
              );
            })}
          </div>

          <div className="onboarding-provider-search-wrap">
            <svg className="onboarding-search-icon" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="11" cy="11" r="8" /><path d="M21 21l-4.35-4.35" />
            </svg>
            <input
              className="onboarding-search-input"
              type="text"
              placeholder="Search for another service…"
              value={search}
              onChange={e => setSearch(e.target.value)}
            />
          </div>

          {searchResults.length > 0 && (
            <div className="onboarding-provider-search-results">
              {searchResults.map(p => {
                const isSelected = selectedProviders.some(x => x.id === p.provider_id);
                return (
                  <button
                    key={p.provider_id}
                    className={`onboarding-seed-result${isSelected ? ' selected' : ''}`}
                    onClick={() => onToggleProvider(p)}
                  >
                    <img
                      className="onboarding-provider-logo"
                      src={`https://image.tmdb.org/t/p/w92${p.logo_path}`}
                      alt={p.provider_name}
                    />
                    <div className="onboarding-seed-info">
                      <div className="onboarding-seed-title">{p.provider_name}</div>
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
          )}
        </>
      )}
    </div>
  );
}
