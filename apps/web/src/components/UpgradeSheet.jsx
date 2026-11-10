// In-app Premium upgrade sheet: opens where a Free limit is hit, leads with the
// feature that lifts it, and links to /plans for the full comparison. A bottom
// sheet on phones, a centred card wider up. Mobile has its own RN counterpart
// (apps/mobile/components/UpgradeSheet.tsx); content comes from @plot/core.
import { useEffect, useId, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useLocation, useNavigate } from 'react-router-dom';
import { upgradeSheetContent, upgradeSheetGateFeature } from '@plot/core/upgradeSheet.js';
import { EVENTS, track } from '../lib/analytics.js';
import { useApp } from '../hooks/useApp.js';
import { usePremium } from '../hooks/usePremium.js';
import { PLANS_PAGE } from '../copy/plansPage.js';
import { premiumPlansPath } from '../utils/premiumExplore.js';
import PremiumPurchaseAction from './PremiumPurchaseAction.jsx';
import { ThemeMiniaturePair } from './ThemeMiniature.jsx';
import './UpgradeSheet.css';

const S = PLANS_PAGE.upgradeSheet;

/**
 * @param {{
 *   reason: import('@plot/core/upgradeSheet.js').UpgradeReason,
 *   onClose: () => void,
 *   returnFocusRef?: { current: HTMLElement | null },
 *   family?: string,
 *   kept?: boolean,
 *   premiumState?: { trialEligible?: boolean },
 * }} props  returnFocusRef: where focus goes on close when the element that had
 *   it is gone (e.g. the create-list dialog the sheet replaced). theme: for
 *   reason 'themes', the Premium family tapped, drawn light and dark (never applied).
 */
export default function UpgradeSheet({ reason, onClose, returnFocusRef, family, kept = false, premiumState }) {
  // Tolerates a missing app context: the sheet now opens from many surfaces,
  // some of which render on their own in Storybook.
  const { profile } = useApp() ?? {};
  // premiumState is for Storybook only: the billing read has no server there,
  // so a story passes the state it wants to show (a first-time subscriber).
  const live = usePremium(profile);
  const premium = premiumState ? { ...live, ...premiumState } : live;
  const navigate = useNavigate();
  const location = useLocation();
  const sheetRef = useRef(null);
  const titleId = useId();
  const content = upgradeSheetContent(reason, { family, kept });
  // Yearly first, as on the plans page. The sheet used to start a monthly
  // checkout with no way to choose, while the plans page led with yearly.
  const [annual, setAnnual] = useState(true);
  const plan = annual ? 'yearly' : 'monthly';
  // True only for a signed-in viewer with no subscription on record (core/billing.js).
  const trial = premium.trialEligible === true;
  // Callers pass inline handlers; reading them through refs keeps the setup
  // below to one run per open, so focus and scroll lock aren't reset on render.
  const onCloseRef = useRef(onClose);
  const returnRef = useRef(returnFocusRef);
  useEffect(() => { onCloseRef.current = onClose; returnRef.current = returnFocusRef; });
  useEffect(() => {
    const feature = upgradeSheetGateFeature(reason);
    if (feature) track(EVENTS.PREMIUM_GATE_HIT, { feature });
  }, [reason]);

  useEffect(() => {
    const restore = document.activeElement;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    // Focus the sheet itself so the first Tab reaches the buttons without
    // painting a focus ring on Upgrade the moment the sheet opens.
    sheetRef.current?.focus();

    // Capture phase + stopPropagation: the sheet can open over another dialog
    // (Add to list), whose own document listener must not also see Escape/Tab.
    const onKeyDown = (event) => {
      if (event.key !== 'Escape' && event.key !== 'Tab') return;
      event.stopPropagation();
      if (event.key === 'Escape') { event.preventDefault(); onCloseRef.current(); return; }
      const focusables = [...(sheetRef.current?.querySelectorAll('button:not(:disabled), a.btn') ?? [])];
      if (!focusables.length) return;
      const first = focusables[0];
      const last = focusables[focusables.length - 1];
      // Focus starts on the sheet itself, which isn't in the list: wrap from there too.
      const onButton = focusables.includes(document.activeElement);
      if (event.shiftKey && (!onButton || document.activeElement === first)) { event.preventDefault(); last.focus(); }
      else if (!event.shiftKey && (!onButton || document.activeElement === last)) { event.preventDefault(); first.focus(); }
    };
    document.addEventListener('keydown', onKeyDown, true);
    return () => {
      document.removeEventListener('keydown', onKeyDown, true);
      document.body.style.overflow = previousOverflow;
      // The body means nothing held focus (the dialog the sheet replaced took it with it).
      const usable = restore && restore !== document.body && restore.isConnected;
      const target = usable ? restore : returnRef.current?.current;
      target?.focus?.();
    };
  }, []);

  if (!content) return null;

  const compare = () => {
    onClose();
    navigate(premiumPlansPath(`${location.pathname}${location.search}`));
  };

  return createPortal(
    <div className="upgrade-sheet-layer">
      <div className="upgrade-sheet-scrim" onClick={onClose} aria-hidden="true" />
      <section ref={sheetRef} className="upgrade-sheet" role="dialog" aria-modal="true" aria-labelledby={titleId} tabIndex={-1}>
        <span className="upgrade-sheet-grab" aria-hidden="true" />
        <p className="upgrade-sheet-context">
          {content.meter > 0 && <span className="upgrade-sheet-meter" aria-hidden="true">
            {Array.from({ length: content.meter }, (_, i) => <i key={i} />)}
          </span>}
          {content.context}
        </p>
        {content.preview && <ThemeMiniaturePair family={content.preview.family} className="upgrade-sheet-preview" />}
        {/* A first-time subscriber is offered the trial first: it is the
            headline and the button, and the feature they tapped is the
            sentence under it. A returning subscriber gets no trial, so the
            feature leads as it used to. */}
        <h2 id={titleId} className="upgrade-sheet-title">{trial ? S.trialTitle : content.title}</h2>
        <p className="upgrade-sheet-body">
          {trial && <strong>{content.title} </strong>}
          {content.preview && <>{content.preview.line} </>}
          {content.body}
        </p>
        {content.kept && <p className="upgrade-sheet-kept">{content.kept}</p>}

        <PremiumPurchaseAction premium={premium} plan={plan} />
        {premium.checkoutAvailable !== false && (
          <p className="upgrade-sheet-terms">{(trial ? S.afterTrial : S.price)[plan]}</p>
        )}
        {premium.checkoutAvailable === false && <p className="upgrade-sheet-note" role="status">{PLANS_PAGE.checkoutClosedDetail}</p>}
        {premium.error && <p className="upgrade-sheet-note" role="alert">{premium.error}</p>}

        {/* One row per plan, each with the price it charges. */}
        <div className="upgrade-sheet-plans" role="group" aria-label={S.planLabel}>
          <button type="button" className="upgrade-sheet-plan" aria-pressed={annual} disabled={premium.busy} onClick={() => setAnnual(true)}>
            <span>
              <span className="upgrade-sheet-plan-name">{PLANS_PAGE.billing.annual}</span>
              <span className="upgrade-sheet-plan-badge">{PLANS_PAGE.billing.annualBadge}</span>
            </span>
            <span className="upgrade-sheet-plan-price">{S.yearlyPrice}</span>
          </button>
          <button type="button" className="upgrade-sheet-plan" aria-pressed={!annual} disabled={premium.busy} onClick={() => setAnnual(false)}>
            <span><span className="upgrade-sheet-plan-name">{PLANS_PAGE.billing.monthly}</span></span>
            <span className="upgrade-sheet-plan-price">{S.monthlyPrice}</span>
          </button>
        </div>

        <div className="upgrade-sheet-foot">
          <button type="button" className="upgrade-sheet-link upgrade-sheet-link--quiet" onClick={compare}>
            {S.seeAll}
          </button>
          <button type="button" className="upgrade-sheet-link upgrade-sheet-link--quiet" onClick={onClose}>{S.notNow}</button>
        </div>
      </section>
    </div>,
    document.body,
  );
}
