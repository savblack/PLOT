import { useState, useEffect, useRef } from 'react';
import { tmdb } from '../api/tmdb';
import './SearchBar.css';

export default function SearchBar({ searchQuery, setSearchQuery, onSubmit, onResultClick, placeholder = 'Search...', autoFocus = false }) {
  const [dropdownResults, setDropdownResults] = useState([]);
  const [showDropdown, setShowDropdown] = useState(false);
  const containerRef = useRef(null);
  const debounceTimer = useRef(null);

  useEffect(() => {
    if (!searchQuery.trim()) {
      setDropdownResults([]);
      setShowDropdown(false);
      return;
    }

    clearTimeout(debounceTimer.current);
    debounceTimer.current = setTimeout(async () => {
      const data = await tmdb.search(searchQuery);
      if (data) {
        const filtered = (data.results || []).filter(r => r.media_type !== 'person').slice(0, 6);
        setDropdownResults(filtered);
        setShowDropdown(filtered.length > 0);
      }
    }, 300);

    return () => clearTimeout(debounceTimer.current);
  }, [searchQuery]);

  useEffect(() => {
    const handler = (e) => {
      if (containerRef.current && !containerRef.current.contains(e.target)) {
        setShowDropdown(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const handleSubmit = (e) => {
    if (e?.preventDefault) e.preventDefault();
    if (!searchQuery.trim()) return;
    setShowDropdown(false);
    onSubmit(searchQuery);
  };

  const handleResultClick = (item) => {
    setShowDropdown(false);
    onResultClick(item);
  };

  const handleClear = () => {
    setSearchQuery('');
    setDropdownResults([]);
    setShowDropdown(false);
  };

  const getYear = (item) => {
    const date = item.release_date || item.first_air_date;
    return date ? new Date(date).getFullYear() : null;
  };

  return (
    <div className="search-bar-wrapper" ref={containerRef}>
      <div className="search-pill search-small">
        <svg className="search-icon" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><circle cx="11" cy="11" r="8"/><path d="M21 21l-4.35-4.35"/></svg>
        <form onSubmit={handleSubmit}>
          <input
            type="text"
            placeholder={placeholder}
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            onFocus={() => dropdownResults.length > 0 && setShowDropdown(true)}
            autoFocus={autoFocus}
          />
        </form>
        {searchQuery.length > 0 && (
          <button className="search-clear-btn" onClick={handleClear} type="button" aria-label="Clear search">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M18 6L6 18M6 6l12 12"/></svg>
          </button>
        )}
      </div>

      {showDropdown && (
        <div className="search-dropdown">
          {dropdownResults.map(item => (
            <button
              key={item.id}
              className="search-dropdown-item"
              onClick={() => handleResultClick(item)}
              type="button"
            >
              <div className="search-dropdown-poster">
                {item.poster_path
                  ? <img src={`https://image.tmdb.org/t/p/w92${item.poster_path}`} alt="" />
                  : <div className="search-dropdown-no-poster" />
                }
              </div>
              <div className="search-dropdown-info">
                <span className="search-dropdown-title">{item.title || item.name}</span>
                <span className="search-dropdown-meta">
                  {getYear(item)}
                  <span className={`search-type-badge ${item.media_type}`}>
                    {item.media_type === 'movie' ? 'Film' : 'TV'}
                  </span>
                </span>
              </div>
            </button>
          ))}
          <button
            className="search-dropdown-see-all"
            onClick={handleSubmit}
            type="button"
          >
            See all results →
          </button>
        </div>
      )}

    </div>
  );
}
