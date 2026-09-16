// Web rendering only: navigation, focus and responsive layout use DOM controls.
// Shared section definitions/search/selection logic live in @plot/core/settings.js.
import { useEffect, useRef, useState } from 'react';
import { SETTINGS_SECTIONS, searchSettingsSections } from '@plot/core/settings.js';
import { SETTINGS_VIEW as T } from '../copy/settingsView.js';
import { COMMON } from '../copy/common.js';
import { IconSearch } from './navIcons.jsx';
import './SettingsPage.css';

export function SettingsTextAction({ children, onClick, disabled = false, tone = 'default', label }) {
  return (
    <button
      type="button"
      className={`settings-text-action${tone === 'danger' ? ' settings-text-action--danger' : ''}`}
      aria-label={label}
      onClick={onClick}
      disabled={disabled}
    >
      <span>{children}</span>
      <span aria-hidden="true">→</span>
    </button>
  );
}

export function SettingsPreferenceRow({ label, value, onEdit, disabled = false }) {
  return (
    <div className="settings-row settings-preference-row">
      <div className="settings-preference-copy">
        <span className="settings-row-label">{label}</span>
        <span className="settings-selection">{value}</span>
      </div>
      <SettingsTextAction label={T.page.editSetting(label)} onClick={onEdit} disabled={disabled}>
        {COMMON.edit}
      </SettingsTextAction>
    </div>
  );
}

export function SettingsSwitch({ label, checked, onChange, disabled = false }) {
  return (
    <button type="button" className="settings-switch" role="switch" aria-label={label} aria-checked={checked} onClick={onChange} disabled={disabled}>
      <span aria-hidden="true" />
    </button>
  );
}

export default function SettingsPage({ section = 'account', onSection, onSignOut, children }) {
  const [query, setQuery] = useState('');
  const navRef = useRef(null);
  useEffect(() => {
    const nav = navRef.current;
    const selected = nav?.querySelector('[aria-current="page"]');
    if (selected && nav.scrollWidth > nav.clientWidth) {
      nav.scrollLeft += selected.getBoundingClientRect().left - nav.getBoundingClientRect().left - 8;
    }
  }, [section]);
  const active = SETTINGS_SECTIONS.find(item => item.id === section) || SETTINGS_SECTIONS[0];
  const matches = searchSettingsSections(query);
  const select = (id) => { setQuery(''); onSection(id); };
  return (
    <div className="settings-page">
      <header className="settings-page-heading">
        <label className="hist-search settings-search">
          <IconSearch />
          <input type="search" aria-label={T.page.search} placeholder={T.page.search} value={query} onChange={event => setQuery(event.target.value)} />
        </label>
      </header>
      <div className="settings-layout">
        <nav ref={navRef} className="settings-section-nav" aria-label={T.page.navigation}>
          {SETTINGS_SECTIONS.map(item => (
            <button key={item.id} type="button" aria-current={active.id === item.id && !query ? 'page' : undefined} onClick={() => select(item.id)}>{item.title}</button>
          ))}
          <button type="button" className="settings-sign-out" onClick={onSignOut}>{T.signOut}<span aria-hidden="true"> →</span></button>
        </nav>
        <div className="settings-detail">
          {query.trim() ? (
            <div className="settings-search-results">
              {!matches.length && <p role="status">{T.page.noResults}</p>}
              {matches.map(item => (
                <button type="button" key={item.id} onClick={() => select(item.id)}><strong>{item.title}</strong><span>{item.description}</span></button>
              ))}
            </div>
          ) : (
            <section aria-labelledby="settings-section-title">
              <header className="settings-detail-heading"><h2 id="settings-section-title">{active.title}</h2><p>{active.description}</p></header>
              {children}
            </section>
          )}
        </div>
      </div>
    </div>
  );
}
