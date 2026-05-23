import { useState } from 'react';
import { createPortal } from 'react-dom';
import { GENRES, REGIONS } from '../constants.js';
import SearchBar from './SearchBar';

export default function AppHeader({
  user, profile,
  view, navigateTo,
  mediaFilter, setMediaFilter,
  searchQuery, setSearchQuery, handleSearch, onResultClick,
  showProfileMenu, setShowProfileMenu,
  showMobileSearch, setShowMobileSearch, onNavigateToProfile,
  theme, setTheme,
  feedLayout, setFeedLayout,
  preferences, setPreferences,
  profileUsernameInput, setProfileUsernameInput,
  profileUsernameSaving, profileUsernameError,
  saveUsername, toggleProfilePublic,
  copyLink, copiedLink,
  showTasteExpanded, setShowTasteExpanded,
  setShowImportModal,
  logout, setShowAuth,
  avatarInputRef, setCropFile,
  onDeleteAccount,
  plexIntegration,
  minimal,
}) {
  const [usernameCopied, setUsernameCopied] = useState(false);
  const [showManageAccount, setShowManageAccount] = useState(false);

  if (minimal) return (
    <header className="main-header animate-in">
      <div className="top-nav">
        <div className="branding-left" onClick={() => navigateTo('home')}>
          <span className="logo-text">PLOT</span>
        </div>
        <div className="header-right">
          <button className="auth-header-btn" onClick={() => setShowAuth(true)}>Sign In</button>
        </div>
      </div>
    </header>
  );
  const copyProfileLink = () => {
    if (!profile?.username) return;
    navigator.clipboard.writeText(`${window.location.origin}/u/${profile.username}`);
    setUsernameCopied(true);
    setTimeout(() => setUsernameCopied(false), 2000);
  };

  return (
    <>
      <header className="main-header animate-in">
        <div className="top-nav">
          <div className="branding-left" onClick={() => navigateTo('home')}>
            <span className="logo-text">PLOT</span>
          </div>

          <div className="center-group">
            <div className="nav-pills header-nav">
              <button onClick={() => navigateTo('home')} className={view === 'home' ? 'active' : ''}>Feed</button>
              <button onClick={() => navigateTo('upcoming')} className={view === 'upcoming' ? 'active' : ''}>Upcoming</button>
              <button onClick={() => navigateTo('watchlist')} className={view === 'watchlist' ? 'active' : ''}>Journal</button>
            </div>

            <div className="filter-toggle">
              <button className={mediaFilter === 'all' ? 'active' : ''} onClick={() => setMediaFilter('all')}>All</button>
              <button className={mediaFilter === 'movie' ? 'active' : ''} onClick={() => setMediaFilter('movie')}>Movies</button>
              <button className={mediaFilter === 'tv' ? 'active' : ''} onClick={() => setMediaFilter('tv')}>TV</button>
            </div>
          </div>

          <div className="header-right">
            <button className="mobile-search-btn" onClick={() => setShowMobileSearch(true)}>
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#aaa" strokeWidth="1.5"><circle cx="11" cy="11" r="8"/><path d="M21 21l-4.35-4.35"/></svg>
            </button>
            <SearchBar
              searchQuery={searchQuery}
              setSearchQuery={setSearchQuery}
              onSubmit={handleSearch}
              onResultClick={onResultClick}
              onProfileClick={onNavigateToProfile}
            />
            {user ? (
              <div className="profile-menu-wrapper">
                <button className="profile-avatar-btn" onClick={() => setShowProfileMenu(v => !v)}>
                  {profile?.avatar_url
                    ? <img src={profile.avatar_url} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover', borderRadius: '50%' }} />
                    : user.email?.[0]?.toUpperCase()
                  }
                </button>
                {showProfileMenu && createPortal(
                  <>
                    <div className="profile-menu-backdrop" onClick={() => setShowProfileMenu(false)} />
                    <div className="profile-dropdown">
                      <div className="profile-dropdown-header">
                        <div className="avatar-upload-wrapper" onClick={() => avatarInputRef.current?.click()}>
                          <div className="profile-dropdown-avatar">
                            {profile?.avatar_url
                              ? <img src={profile.avatar_url} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover', borderRadius: '50%' }} />
                              : user.email?.[0]?.toUpperCase()
                            }
                          </div>
                          <div className="avatar-upload-overlay">
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
                          </div>
                          <input
                            ref={avatarInputRef}
                            type="file"
                            accept="image/*"
                            style={{ display: 'none' }}
                            onChange={e => { const f = e.target.files?.[0]; if (f) setCropFile(f); e.target.value = ''; }}
                          />
                        </div>
                        <p className="profile-dropdown-email">{user.email}</p>
                      </div>
                      <div className="profile-dropdown-settings">
                        <div className="settings-row">
                          <span className="settings-label">Theme</span>
                          <div className="settings-toggle">
                            <button className={theme === 'light' ? 'active' : ''} onClick={() => setTheme('light')} title="Light">
                              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="5"/><line x1="12" y1="1" x2="12" y2="3"/><line x1="12" y1="21" x2="12" y2="23"/><line x1="4.22" y1="4.22" x2="5.64" y2="5.64"/><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"/><line x1="1" y1="12" x2="3" y2="12"/><line x1="21" y1="12" x2="23" y2="12"/><line x1="4.22" y1="19.78" x2="5.64" y2="18.36"/><line x1="18.36" y1="5.64" x2="19.78" y2="4.22"/></svg>
                            </button>
                            <button className={theme === 'dark' ? 'active' : ''} onClick={() => setTheme('dark')} title="Dark">
                              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/></svg>
                            </button>
                            <button className={theme === 'system' ? 'active' : ''} onClick={() => setTheme('system')} title="System">
                              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><path d="M12 2a10 10 0 0 1 0 20z" fill="currentColor" stroke="none"/></svg>
                            </button>
                          </div>
                        </div>
                        <div className="settings-row">
                          <span className="settings-label">View</span>
                          <div className="settings-toggle">
                            <button className={feedLayout === 'bento' ? 'active' : ''} onClick={() => setFeedLayout('bento')} title="Bento">
                              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="3" width="7" height="11" rx="1"/><rect x="14" y="3" width="7" height="5" rx="1"/><rect x="14" y="12" width="7" height="9" rx="1"/><rect x="3" y="18" width="7" height="3" rx="1"/></svg>
                            </button>
                            <button className={feedLayout === 'grid' ? 'active' : ''} onClick={() => setFeedLayout('grid')} title="Grid">
                              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="3" width="7" height="9" rx="1"/><rect x="14" y="3" width="7" height="9" rx="1"/><rect x="3" y="15" width="7" height="9" rx="1"/><rect x="14" y="15" width="7" height="9" rx="1"/></svg>
                            </button>
                          </div>
                        </div>
                        <div className="settings-row">
                          <span className="settings-label">Region</span>
                          <select
                            className="region-select"
                            value={preferences.region || 'AU'}
                            onChange={e => setPreferences(p => ({ ...p, region: e.target.value }))}
                          >
                            {REGIONS.map(r => (
                              <option key={r.code} value={r.code}>{r.name}</option>
                            ))}
                          </select>
                        </div>
                      </div>
                      <div className="profile-public-section">
                        <div className="settings-row">
                          <span className="settings-label">Username</span>
                          <div className="username-copy-wrap" onClick={copyProfileLink}>
                            <span className="username-tooltip">
                              {usernameCopied ? 'Copied!' : 'Copy profile link'}
                            </span>
                            <div className="username-input-row">
                              <span className="username-at">@</span>
                              <input
                                className="username-input"
                                value={profileUsernameInput}
                                placeholder="set username"
                                onChange={e => setProfileUsernameInput(e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, ''))}
                                onKeyDown={e => {
                                  if (e.key === 'Enter') saveUsername();
                                  if (e.key === 'Escape') setProfileUsernameInput(profile?.username || '');
                                }}
                                onBlur={saveUsername}
                                maxLength={30}
                              />
                              {profileUsernameSaving && <span className="username-saving">...</span>}
                            </div>
                          </div>
                        </div>
                        {profileUsernameError && <p className="username-error">{profileUsernameError}</p>}
                        <div className="settings-row">
                          <span className="settings-label">Visibility</span>
                          <div className="settings-toggle">
                            <button
                              className={profile?.is_public ? 'active' : ''}
                              onClick={() => { if (!profile?.is_public) toggleProfilePublic(); }}
                              data-tooltip="Public"
                            >
                              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>
                            </button>
                            <button
                              className={!profile?.is_public ? 'active' : ''}
                              onClick={() => { if (profile?.is_public) toggleProfilePublic(); }}
                              data-tooltip="Private"
                            >
                              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"/><line x1="1" y1="1" x2="23" y2="23"/></svg>
                            </button>
                          </div>
                        </div>
                        {profile?.is_public && profile?.username && (
                          <div className="settings-row">
                            <button className="copy-link-btn" onClick={() => copyLink('profile')}>
                              {copiedLink === 'profile' ? 'Copied!' : 'Copy profile link'}
                            </button>
                          </div>
                        )}
                      </div>
                      <div className="profile-public-section">
                        <button className="taste-accordion-btn" onClick={() => setShowTasteExpanded(v => !v)}>
                          <span className="settings-label">Taste</span>
                          <span className="taste-accordion-meta">
                            {preferences.genres.length > 0 ? `${preferences.genres.length} selected` : 'None'}
                            <svg className={`taste-chevron ${showTasteExpanded ? 'open' : ''}`} width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="6 9 12 15 18 9"/></svg>
                          </span>
                        </button>
                        {showTasteExpanded && (
                          <div className="taste-genre-list">
                            {GENRES.map(g => {
                              const checked = preferences.genres.includes(g.key);
                              return (
                                <label key={g.key} className="taste-genre-row">
                                  <input
                                    type="checkbox"
                                    checked={checked}
                                    onChange={() => setPreferences(p => ({
                                      ...p,
                                      genres: checked
                                        ? p.genres.filter(k => k !== g.key)
                                        : [...p.genres, g.key],
                                    }))}
                                  />
                                  <span className={`taste-genre-circle ${checked ? 'active' : ''}`} />
                                  {g.label}
                                </label>
                              );
                            })}
                          </div>
                        )}
                      </div>
                      {plexIntegration && (
                        <div className="profile-public-section">
                          <div className="settings-row">
                            <span className="settings-label">Plex</span>
                            {plexIntegration.status === 'disconnected' && (
                              <button className="copy-link-btn" onClick={plexIntegration.startAuth} disabled={plexIntegration.loading}>
                                {plexIntegration.loading ? 'Starting…' : 'Connect'}
                              </button>
                            )}
                            {plexIntegration.status === 'pending' && (
                              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                                <span className="plex-spinner plex-spinner--sm" />
                                <span style={{ fontSize: '0.78rem', color: 'var(--text-secondary)' }}>Waiting…</span>
                                <button className="copy-link-btn" onClick={plexIntegration.cancelAuth}>Cancel</button>
                              </div>
                            )}
                            {(plexIntegration.status === 'connected' || plexIntegration.status === 'syncing') && (
                              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
                                {plexIntegration.plexUsername && (
                                  <span style={{ fontSize: '0.78rem', color: 'var(--text-secondary)' }}>
                                    {plexIntegration.plexUsername}
                                  </span>
                                )}
                                <button className="copy-link-btn" onClick={plexIntegration.syncNow} disabled={plexIntegration.status === 'syncing'}>
                                  {plexIntegration.status === 'syncing' ? 'Syncing…' : 'Sync'}
                                </button>
                                <button className="copy-link-btn" onClick={plexIntegration.disconnect} disabled={plexIntegration.loading}>
                                  Disconnect
                                </button>
                              </div>
                            )}
                            {plexIntegration.status === 'error' && (
                              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                                <span style={{ fontSize: '0.78rem', color: '#c0392b' }}>Error</span>
                                <button className="copy-link-btn" onClick={plexIntegration.syncNow}>Retry</button>
                                <button className="copy-link-btn" onClick={plexIntegration.disconnect}>Disconnect</button>
                              </div>
                            )}
                          </div>
                          {plexIntegration.status === 'needs_server' && (
                            <div className="settings-row" style={{ gap: '0.5rem' }}>
                              <select
                                className="region-select"
                                value={plexServerSelected}
                                onChange={e => setPlexServerSelected(e.target.value)}
                              >
                                <option value="">Pick a server…</option>
                                {plexIntegration.servers.map(s => (
                                  <option key={s.id} value={s.id}>{s.name}</option>
                                ))}
                              </select>
                              <button
                                className="copy-link-btn"
                                disabled={!plexServerSelected}
                                onClick={() => plexIntegration.selectServer(plexServerSelected)}
                              >
                                Use
                              </button>
                            </div>
                          )}
                        </div>
                      )}
                      <div className="profile-public-section">
                        <div className="settings-row">
                          <span className="settings-label">History</span>
                          <button className="copy-link-btn" onClick={() => { setShowImportModal(true); setShowProfileMenu(false); }}>
                            Import watch history
                          </button>
                        </div>
                      </div>
                      <button className="profile-dropdown-item danger" onClick={() => { logout(); setShowProfileMenu(false); }}>
                        Sign Out
                      </button>
                      <hr className="dropdown-divider" />
                      <button className="manage-account-toggle" onClick={() => setShowManageAccount(v => !v)}>
                        Manage account
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ transform: showManageAccount ? 'rotate(180deg)' : 'none', transition: 'transform 0.2s' }}>
                          <polyline points="6 9 12 15 18 9"/>
                        </svg>
                      </button>
                      {showManageAccount && (
                        <div className="manage-account-content">
                          <p className="manage-account-desc">Permanently deletes your account, lists, journal entries, and all data. This cannot be undone.</p>
                          <button className="manage-account-delete" onClick={() => { setShowProfileMenu(false); setShowManageAccount(false); onDeleteAccount?.(); }}>
                            Delete account
                          </button>
                        </div>
                      )}
                    </div>
                  </>,
                  document.body
                )}
              </div>
            ) : (
              <button className="auth-header-btn" onClick={() => setShowAuth(true)}>Sign In</button>
            )}
          </div>
        </div>
      </header>

      {showMobileSearch && (
        <div className="mobile-search-overlay">
          <SearchBar
            searchQuery={searchQuery}
            setSearchQuery={setSearchQuery}
            onSubmit={(q) => { handleSearch(q); setShowMobileSearch(false); }}
            onResultClick={(item) => { onResultClick(item); setShowMobileSearch(false); }}
            placeholder="Search movies & TV..."
            autoFocus
          />
          <button className="mobile-search-cancel" onClick={() => setShowMobileSearch(false)}>Cancel</button>
        </div>
      )}
    </>
  );
}
