// The Episode alerts card, render only (EpisodeAlertsCard.jsx owns the data and
// the actions), so Storybook can show every state without an account.
import { useEffect, useRef, useState } from 'react';
import { EPISODE_ALERTS as T } from '@plot/core/copy/episodeAlerts.js';
import { SETTINGS_VIEW } from '../copy/settingsView.js';
import { APP_SHELL } from '../copy/appShell.js';
import { SettingsSwitch } from './SettingsPage.jsx';
import './EpisodeAlertsCard.css';

function BellIcon() {
  return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M6 8a6 6 0 1 1 12 0c0 7 3 8 3 8H3s3-1 3-8" /><path d="M10 20a2 2 0 0 0 4 0" /></svg>;
}
function CalendarIcon() {
  return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><rect x="3" y="5" width="18" height="16" rx="2" /><path d="M3 10h18M8 3v4M16 3v4" /></svg>;
}

/**
 * @param {{
 *   title: string, on: boolean, ready: boolean, busy: boolean, error: boolean,
 *   next: { when: string, label: string } | null, isPremium: boolean,
 *   onToggle: () => void, onSubscribe: () => void, onDownload: () => void,
 *   defaultMenuOpen?: boolean,
 * }} props
 */
export default function EpisodeAlertsView({ title, on, ready, busy, error, next, isPremium, onToggle, onSubscribe, onDownload, defaultMenuOpen = false }) {
  const [menuOpen, setMenuOpen] = useState(defaultMenuOpen);
  const menuRef = useRef(null);

  useEffect(() => {
    if (!menuOpen) return undefined;
    const close = (e) => { if (!menuRef.current?.contains(e.target)) setMenuOpen(false); };
    const onKey = (e) => { if (e.key === 'Escape') setMenuOpen(false); };
    document.addEventListener('mousedown', close);
    document.addEventListener('keydown', onKey);
    return () => { document.removeEventListener('mousedown', close); document.removeEventListener('keydown', onKey); };
  }, [menuOpen]);

  return (
    <section className="panel-card ep-alerts" aria-label={T.title}>
      <div className="ep-alerts-row">
        <span className="ep-alerts-icon ep-alerts-icon--bell"><BellIcon /></span>
        <div className="ep-alerts-copy">
          <h3 className="ep-alerts-title">{T.title}</h3>
          <p className="ep-alerts-hint">{on ? T.hintOn : T.hintOff}</p>
          {error && <p className="ep-alerts-error" role="alert">{T.error}</p>}
        </div>
        <SettingsSwitch
          label={on ? T.turnOff(title) : T.turnOn(title)}
          checked={on}
          onChange={onToggle}
          disabled={busy}
        />
      </div>
      {on && ready && (
        <div className="ep-alerts-row ep-alerts-row--next">
          <span className="ep-alerts-icon"><CalendarIcon /></span>
          <p className="ep-alerts-next">
            {next ? <><b>{T.nextEpisode} {next.when}</b>{next.label && <span> · {next.label}</span>}</> : <span>{T.noNextEpisode}</span>}
          </p>
          <div className="ep-alerts-menu-wrap" ref={menuRef}>
            <button type="button" className="ep-alerts-add" aria-haspopup="menu" aria-expanded={menuOpen} onClick={() => setMenuOpen(o => !o)}>
              {T.addToCalendar}
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M6 9l6 6 6-6" /></svg>
            </button>
            {menuOpen && (
              <div className="ep-alerts-menu" role="menu">
                <button type="button" role="menuitem" className="ep-alerts-option" onClick={() => { setMenuOpen(false); onSubscribe(); }}>
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M21 12a9 9 0 1 1-3-6.7L21 8" /><path d="M21 3v5h-5" /></svg>
                  <span>
                    <b>{SETTINGS_VIEW.calendarFeed.subscribeLabel}{!isPremium && <i className="ep-alerts-premium">{APP_SHELL.premium}</i>}</b>
                    <span>{T.subscribeHint}</span>
                  </span>
                </button>
                <button type="button" role="menuitem" className="ep-alerts-option" onClick={() => { setMenuOpen(false); onDownload(); }}>
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M12 4v11M7 10l5 5 5-5M5 20h14" /></svg>
                  <span><b>{SETTINGS_VIEW.calendarFeed.downloadIcs}</b><span>{T.downloadHint}</span></span>
                </button>
              </div>
            )}
          </div>
        </div>
      )}
    </section>
  );
}
