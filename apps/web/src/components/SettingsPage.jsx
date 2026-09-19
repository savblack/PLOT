// Web rendering only: navigation, focus and responsive layout use DOM controls.
// Shared section definitions/search/selection logic live in @plot/core/settings.js.
//
// Layout: the Calendar/Guide/History shell — a narrow sticky left column of
// cream cards (.cal-side + .hist-card) beside one wide stream (.cal-stream),
// under the shared .hist-toolbar. The column leads with the account itself,
// then the section list as .cal-filter-row rows; below the sidebar breakpoint
// the whole column is hidden by .cal-side and the sections move into a chip row
// at the top of the stream, the way the Guide moves its day picker.
import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
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

/* Who you are, at the top of the column: the one thing on this page that is a
   fact rather than a control, so it earns the card the way the Calendar's mini
   months do. */
function AccountCard({ account }) {
  const { name = '', username = '', avatarUrl = null, isPremium = false } = account ?? {};
  const initial = (name || username || '?').trim().charAt(0).toUpperCase();
  return (
    <div className="hist-card settings-account-card">
      <div className="settings-account-identity">
        <span className="settings-account-avatar" aria-hidden="true">
          {avatarUrl ? <img src={avatarUrl} alt="" /> : initial}
        </span>
        <span className="settings-account-names">
          <span className="settings-account-name">{name || T.page.noName}</span>
          {username && <span className="hist-card-note">@{username}</span>}
        </span>
      </div>
      <div className="settings-account-foot">
        <span className="settings-account-plan">{isPremium ? T.page.planPremium : T.page.planFree}</span>
        {username && (
          <Link className="settings-text-action" to={`/u/${username}`}>
            <span>{T.page.viewProfile}</span><span aria-hidden="true">→</span>
          </Link>
        )}
      </div>
    </div>
  );
}

export default function SettingsPage({ section = 'account', onSection, onSignOut, account, children }) {
  const [query, setQuery] = useState('');
  const chipsRef = useRef(null);
  // The chip row scrolls on a phone, so keep the selected section in sight.
  useEffect(() => {
    const chips = chipsRef.current;
    const selected = chips?.querySelector('[aria-current="page"]');
    if (selected && chips.scrollWidth > chips.clientWidth) {
      chips.scrollLeft += selected.getBoundingClientRect().left - chips.getBoundingClientRect().left - 8;
    }
  }, [section]);
  const active = SETTINGS_SECTIONS.find(item => item.id === section) || SETTINGS_SECTIONS[0];
  const matches = searchSettingsSections(query);
  const searching = !!query.trim();
  const select = (id) => { setQuery(''); onSection(id); };
  // aria-current, not a tick: the selected row is the accent plus the heavier
  // weight, same as every other row list in the app.
  const current = (id) => (active.id === id && !searching ? 'page' : undefined);

  const signOut = <button type="button" className="settings-sign-out" onClick={onSignOut}>{T.signOut}<span aria-hidden="true"> →</span></button>;

  return (
    <div className="hist-page settings-page">
      <div className="hist-toolbar settings-toolbar">
        <label className="hist-search settings-search">
          <IconSearch />
          <input type="search" aria-label={T.page.search} placeholder={T.page.search} value={query} onChange={event => setQuery(event.target.value)} />
        </label>
      </div>

      <div className="cal-body">
        <aside className="cal-side settings-side">
          <AccountCard account={account} />
          <nav className="hist-card settings-nav-card" aria-label={T.page.navigation}>
            {SETTINGS_SECTIONS.map(item => (
              <button key={item.id} type="button" className="cal-filter-row settings-nav-row" aria-current={current(item.id)} onClick={() => select(item.id)}>
                <span className="cal-filter-name">{item.title}</span>
              </button>
            ))}
          </nav>
          {signOut}
        </aside>

        <section className="cal-stream settings-detail" aria-labelledby="settings-section-title">
          {/* Below the sidebar breakpoint the whole column is hidden, so the
              account card and the sections sit here instead — the card full
              width, the sections as a scrolling chip row. */}
          <div className="settings-mobile-head">
            <AccountCard account={account} />
            <nav ref={chipsRef} className="settings-mobile-nav" aria-label={T.page.navigation}>
              {SETTINGS_SECTIONS.map(item => (
                <button key={item.id} type="button" className="settings-chip" aria-current={current(item.id)} onClick={() => select(item.id)}>{item.title}</button>
              ))}
            </nav>
          </div>

          {searching ? (
            <div className="settings-search-results">
              {!matches.length && <p role="status">{T.page.noResults}</p>}
              {matches.map(item => (
                <button type="button" key={item.id} onClick={() => select(item.id)}><strong>{item.title}</strong><span>{item.description}</span></button>
              ))}
            </div>
          ) : (
            <>
              <div className="cal-stream-month settings-section-head">
                <h2 className="cal-stream-month-name" id="settings-section-title">{active.title}</h2>
                <span className="cal-stream-month-count">{active.description}</span>
              </div>
              {children}
              <div className="settings-mobile-foot">{signOut}</div>
            </>
          )}
        </section>
      </div>
    </div>
  );
}
