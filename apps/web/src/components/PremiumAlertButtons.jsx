// Premium alert toggles: release alerts on a person (talent page and the panel's
// talent view) and a whole-season-ready alert on a show (title panel). The
// opt-in logic lives in @plot/core/usePremiumAlerts.js and the database is the
// authority on Premium; a Free account gets the upgrade sheet, either up front
// (billing status already says Free) or when the insert comes back
// premium_required.
//
// Mobile parity: not shipped on mobile yet. Tracked in the GitHub issue
// "Mobile parity: actor/director and season-ready alerts" (issue 1093).
import { useState } from 'react';
import { useApp } from '../hooks/useApp.js';
import { usePremium } from '../hooks/usePremium.js';
import { usePersonAlert, useSeasonReadyAlert } from '@plot/core/usePremiumAlerts.js';
import { PREMIUM_ALERTS as A } from '@plot/core/copy/premiumAlerts.js';
import UpgradeSheet from './UpgradeSheet.jsx';
import './PremiumAlertButtons.css';

function BellIcon({ on }) {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill={on ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9" />
      <path d="M10.3 21a1.94 1.94 0 0 0 3.4 0" />
    </svg>
  );
}

/** Upgrade-sheet-aware wrapper around a core alert toggle. */
function useGatedToggle(alert) {
  const { profile } = useApp();
  const premium = usePremium(profile);
  const [sheetOpen, setSheetOpen] = useState(false);
  // Billing status loads asynchronously; until it has, let the server decide.
  const knownFree = premium.billing !== null && !premium.isPremium;
  const onClick = async () => {
    // Turning an alert off always works, Premium or not.
    if (!alert.on && knownFree) { setSheetOpen(true); return; }
    const { error } = await alert.toggle();
    if (error === 'premium_required') setSheetOpen(true);
  };
  const failed = alert.error && alert.error !== 'premium_required';
  return { onClick, sheetOpen, closeSheet: () => setSheetOpen(false), failed };
}

/** "Get alerts" for an actor or director. `person` is TMDB person details. */
export function PersonAlertButton({ person }) {
  const { user } = useApp();
  const alert = usePersonAlert(user?.id, person);
  const gate = useGatedToggle(alert);
  if (!user || !person?.id || !person?.name) return null;
  return (
    <>
      <button
        type="button"
        className={`btn btn-secondary btn-sm alert-toggle${alert.on ? ' alert-toggle--on' : ''}`}
        onClick={gate.onClick}
        disabled={alert.loading || alert.busy}
        aria-pressed={alert.on}
        aria-label={alert.on ? A.person.onLabel(person.name) : A.person.offLabel(person.name)}
      >
        <BellIcon on={alert.on} />
        {alert.on ? A.person.on : A.person.off}
      </button>
      {gate.failed && <p className="alert-toggle-error" role="alert">{A.error}</p>}
      {gate.sheetOpen && <UpgradeSheet reason="alerts" onClose={gate.closeSheet} />}
    </>
  );
}

/** Whole-season-ready alert card for a TV show. `show` is TMDB TV details. */
export function SeasonReadyAlert({ show }) {
  const { user, profile } = useApp();
  const alert = useSeasonReadyAlert(user?.id, show);
  const gate = useGatedToggle(alert);
  if (!user || !show?.id || !show?.name) return null;
  const hasServices = (profile?.streaming_providers?.length ?? 0) > 0;
  return (
    <section className="panel-card alert-card">
      <div className="alert-card-row">
        <div className="alert-card-copy">
          <h3 className="panel-card-title">{A.season.title}</h3>
          <p className="alert-card-hint">{hasServices ? A.season.hint : A.season.needsServices}</p>
        </div>
        <button
          type="button"
          className={`btn btn-secondary btn-xs alert-toggle${alert.on ? ' alert-toggle--on' : ''}`}
          onClick={gate.onClick}
          disabled={alert.loading || alert.busy}
          aria-pressed={alert.on}
          aria-label={alert.on ? A.season.onLabel : A.season.offLabel}
        >
          <BellIcon on={alert.on} />
          {alert.on ? A.season.on : A.season.off}
        </button>
      </div>
      {gate.failed && <p className="alert-toggle-error" role="alert">{A.error}</p>}
      {gate.sheetOpen && <UpgradeSheet reason="alerts" onClose={gate.closeSheet} />}
    </section>
  );
}
