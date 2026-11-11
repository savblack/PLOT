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

/* How long "Saved" stays beside a switch, and how long a click may wait for
   its change before it is forgotten (a click that opened an upgrade sheet, or
   a save that never answered, must not light up "Saved" minutes later). */
const SAVED_NOTE_MS = 2000;
const SAVED_WAIT_MS = 10000;
/* Once busy has cleared with the switch unmoved, how much longer to wait.
   Several settings clear busy when the save answers and only move the switch
   after a second fetch of the profile (about 200ms). A failed save never
   moves it, so it simply runs out. */
const SAVED_SETTLE_MS = 3000;

/**
 * @param {object} props
 * @param {string} props.label
 * @param {boolean} props.checked
 * @param {() => void} props.onChange
 * @param {boolean} [props.disabled]
 * @param {boolean} [props.saves]  this switch saves the moment it is flipped
 *   (design audit, 10 Nov 2026, pick 2.2 A: instant for choices). A small
 *   "Saved" shows beside it once the change has really landed: `checked` has
 *   moved from where it was at the click and the switch is no longer
 *   `disabled` (busy). The switch may move a moment after busy clears (the
 *   parent fetches the saved row again), so it keeps waiting briefly. A save
 *   that fails and leaves the switch where it was shows nothing. Leave it off
 *   for a switch inside a form with its own Save.
 */
export function SettingsSwitch({ label, checked, onChange, disabled = false, saves = false }) {
  const [saved, setSaved] = useState(false);
  // The value at the click we are waiting on, or null when not waiting.
  const waiting = useRef(/** @type {{ from: boolean, wasBusy: boolean, settling: boolean } | null} */ (null));
  const timers = useRef(/** @type {{ wait?: ReturnType<typeof setTimeout>, note?: ReturnType<typeof setTimeout> }} */ ({}));

  useEffect(() => {
    const wait = waiting.current;
    if (!wait) return;
    if (disabled) { wait.wasBusy = true; return; }
    if (checked !== wait.from) {
      waiting.current = null;
      clearTimeout(timers.current.wait);
      // eslint-disable-next-line react-hooks/set-state-in-effect -- the note follows the saved value the parent hands back
      setSaved(true);
      clearTimeout(timers.current.note);
      timers.current.note = setTimeout(() => setSaved(false), SAVED_NOTE_MS);
    } else if (wait.wasBusy && !wait.settling) {
      // Busy came and went and the switch is where it started. Either the save
      // failed, or it succeeded and the parent is still fetching the saved row
      // (kids content, marketing emails and public profile do this). Wait a
      // little longer instead of giving up: a failure never moves the switch,
      // so it runs out with no note.
      wait.settling = true;
      clearTimeout(timers.current.wait);
      timers.current.wait = setTimeout(() => { waiting.current = null; }, SAVED_SETTLE_MS);
    }
  }, [checked, disabled]);

  useEffect(() => () => { clearTimeout(timers.current.wait); clearTimeout(timers.current.note); }, []);

  const onClick = () => {
    if (saves) {
      waiting.current = { from: checked, wasBusy: false, settling: false };
      clearTimeout(timers.current.wait);
      timers.current.wait = setTimeout(() => { waiting.current = null; }, SAVED_WAIT_MS);
    }
    onChange();
  };

  const button = (
    <button type="button" className="settings-switch" role="switch" aria-label={label} aria-checked={checked} onClick={onClick} disabled={disabled}>
      <span aria-hidden="true" />
    </button>
  );
  if (!saves) return button;
  return (
    <span className="settings-switch-saves">
      <span className={`settings-saved-note${saved ? ' is-on' : ''}`} role="status">{saved ? COMMON.saved : ''}</span>
      {button}
    </span>
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
