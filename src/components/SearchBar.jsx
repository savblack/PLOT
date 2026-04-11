import { useState, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { tmdb } from '../api/tmdb';
import { supabase } from '../api/supabase';
import './SearchBar.css';

const HIDE_PEOPLE_KEY = 'plot_search_hide_people';

export default function SearchBar({ searchQuery, setSearchQuery, onSubmit, onResultClick, onProfileClick, placeholder = 'Search...', autoFocus = false }) {
  const [dropdownResults, setDropdownResults] = useState([]);
  const [peopleResults, setPeopleResults] = useState([]);
  const [showDropdown, setShowDropdown] = useState(false);
  const [dropdownPos, setDropdownPos] = useState({ top: 0, left: 0, width: 0 });
  const [hidePeople, setHidePeople] = useState(() => localStorage.getItem(HIDE_PEOPLE_KEY) === 'true');
  const containerRef = useRef(null);
  const dropdownRef = useRef(null);
  const debounceTimer = useRef(null);

  useEffect(() => {
    if (!searchQuery.trim()) {
      setDropdownResults([]);
      setPeopleResults([]);
      setShowDropdown(false);
      return;
    }

    clearTimeout(debounceTimer.current);
    debounceTimer.current = setTimeout(async () => {
      if (containerRef.current) {
        const rect = containerRef.current.getBoundingClientRect();
        if (rect.width === 0) return;
      }

      const [tmdbData, { data: profiles }] = await Promise.all([
        tmdb.search(searchQuery),
        supabase
          .from('profiles')
          .select('id, username, display_name, avatar_url')
          .eq('is_public', true)
          .or(`username.ilike.%${searchQuery}%,display_name.ilike.%${searchQuery}%`)
          .limit(3),
      ]);

      const filtered = (tmdbData?.results || []).filter(r => r.media_type !== 'person').slice(0, 6);
      setDropdownResults(filtered);
      setPeopleResults(profiles || []);
      setShowDropdown(filtered.length > 0 || (profiles?.length > 0));
    }, 300);

    return () => clearTimeout(debounceTimer.current);
  }, [searchQuery]);

  // Reposition dropdown whenever it becomes visible
  useEffect(() => {
    if (!showDropdown || !containerRef.current) return;
    const rect = containerRef.current.getBoundingClientRect();
    setDropdownPos({
      top: rect.bottom + window.scrollY + 8,
      left: rect.right - 320,
      width: 320,
    });
  }, [showDropdown]);

  useEffect(() => {
    const handler = (e) => {
      if (
        containerRef.current && !containerRef.current.contains(e.target) &&
        dropdownRef.current && !dropdownRef.current.contains(e.target)
      ) {
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

  const handleProfileClick = (username) => {
    setShowDropdown(false);
    setSearchQuery('');
    onProfileClick?.(username);
  };

  const handleClear = () => {
    setSearchQuery('');
    setDropdownResults([]);
    setPeopleResults([]);
    setShowDropdown(false);
  };

  const toggleHidePeople = (e) => {
    e.stopPropagation();
    const next = !hidePeople;
    setHidePeople(next);
    localStorage.setItem(HIDE_PEOPLE_KEY, String(next));
  };

  const getYear = (item) => {
    const date = item.release_date || item.first_air_date;
    return date ? new Date(date).getFullYear() : null;
  };

  const hasMedia = dropdownResults.length > 0;
  const hasPeople = peopleResults.length > 0;

  const dropdown = showDropdown ? createPortal(
    <div
      ref={dropdownRef}
      className="search-dropdown"
      style={{ position: 'absolute', top: dropdownPos.top, left: dropdownPos.left, width: dropdownPos.width }}
    >
      {hasMedia && dropdownResults.map(item => (
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

      {hasPeople && (
        <div className="search-people-section">
          <div className="search-people-header">
            <span className="search-people-label">People</span>
            <button className="search-people-toggle" onClick={toggleHidePeople} type="button">
              {hidePeople ? 'Show' : 'Hide'}
            </button>
          </div>
          {!hidePeople && peopleResults.map(person => (
            <button
              key={person.id}
              className="search-dropdown-item"
              onClick={() => handleProfileClick(person.username)}
              type="button"
            >
              <div className="search-dropdown-avatar">
                {person.avatar_url
                  ? <img src={person.avatar_url} alt="" />
                  : <span>{(person.display_name || person.username)?.[0]?.toUpperCase()}</span>
                }
              </div>
              <div className="search-dropdown-info">
                <span className="search-dropdown-title">{person.display_name || person.username}</span>
                <span className="search-dropdown-meta">@{person.username}</span>
              </div>
            </button>
          ))}
        </div>
      )}

      <button
        className="search-dropdown-see-all"
        onClick={handleSubmit}
        type="button"
      >
        See all results →
      </button>
    </div>,
    document.body
  ) : null;

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
            onFocus={() => (dropdownResults.length > 0 || peopleResults.length > 0) && setShowDropdown(true)}
            autoFocus={autoFocus}
          />
        </form>
        {searchQuery.length > 0 && (
          <button className="search-clear-btn" onClick={handleClear} type="button" aria-label="Clear search">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M18 6L6 18M6 6l12 12"/></svg>
          </button>
        )}
      </div>
      {dropdown}
    </div>
  );
}
