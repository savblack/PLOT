// In-app Premium upgrade sheet: opens where a Free viewer hits a Premium gate.
// A first-time subscriber is offered the free trial first, with the feature
// they tapped as the sentence under it; a returning subscriber sees the
// feature first. Each plan is one row with its price, and a quiet link leads
// to /plans for everything else. A bottom sheet on phones, a centred card
// wider up. Mobile has its own RN counterpart, still on the older layout
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
import { Tag } from './Chip.jsx';
import './UpgradeSheet.css';

const S = PLANS_PAGE.upgradeSheet;
// How long the offer waits for the first billing read before showing anyway.
const HOLD_MS = 700;

/**
 * @param {{
 *   reason: import('@plot/core/upgradeSheet.js').UpgradeReason,
 *   onClose: () => void,
 *   returnFocusRef?: { current: HTMLElement | null },
 *   family?: string,
 *   kept?: boolean,
 *   onAction?: (target: 'checkout' | 'plans', plan?: string) => void,
 * }} props  returnFocusRef: where focus goes on close when the element that had
 *   it is gone (e.g. the create-list dialog the sheet replaced). theme: for
 *   reason 'themes', the Premium family tapped, drawn light and dark (never applied).
 *   onAction: told when the viewer presses the purchase button or See everything,
 *   before the sheet acts (the trial prompt counts those as clicks, not dismissals).
 */
export default function UpgradeSheet(props) {
  // Tolerates a missing app context: the sheet now opens from many surfaces,
  // some of which render on their own in Storybook.
  const { profile } = useApp() ?? {};
  const premium = usePremium(profile);
  return <UpgradeSheetView {...props} premium={premium} />;
}

/**
 * The sheet itself, given the billing state to show. The default export above
 * passes the real one. Storybook passes a made-up one, which is safe because
 * the same object carries `startCheckout`: there is no way to show a trial
 * promise here while a different hook sends the request.
 *
 * @param {Parameters<typeof UpgradeSheet>[0] & { premium: ReturnType<typeof usePremium> }} props
 */
export function UpgradeSheetView({ reason, onClose, returnFocusRef, family, kept = false, premium, onAction }) {
  const navigate = useNavigate();
  const location = useLocation();
  const sheetRef = useRef(null);
  const titleId = useId();
  const content = upgradeSheetContent(reason, { family, kept });
  // Yearly first, as on the plans page. The sheet used to start a monthly
  // checkout with no way to choose, while the plans page led with yearly.
  const [annual, setAnnual] = useState(true);
  const plan = annual ? 'yearly' : 'monthly';
  // Checkout can be closed (the waitlist state): nothing is for sale, so no
  // trial is offered and no plans are shown.
  const open = premium.checkoutAvailable !== false;
  // True only for a signed-in viewer with no subscription on record (core/billing.js).
  const trial = open && premium.trialEligible === true;
  // Until the first billing read answers, the sheet does not know which of
  // its two versions to show. It holds the offer back (the space is kept)
  // rather than drawing the no-trial version and swapping the headline. Not
  // for long: a slow or stuck read must not leave a sheet with no button, so
  // after HOLD_MS it shows the no-trial version, which promises nothing.
  const [waited, setWaited] = useState(false);
  useEffect(() => {
    if (premium.billingReady !== false) return undefined;
    const timer = setTimeout(() => setWaited(true), HOLD_MS);
    return () => clearTimeout(timer);
  }, [premium.billingReady]);
  const pending = premium.billingReady === false && !waited;
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
    onAction?.('plans');
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
        <div className={`upgrade-sheet-offer${pending ? ' is-pending' : ''}`} aria-busy={pending || undefined}>
        <h2 id={titleId} className="upgrade-sheet-title">{trial ? S.trialTitle : content.title}</h2>
        <p className="upgrade-sheet-body">
          {trial && <strong>{content.title} </strong>}
          {content.preview && <>{content.preview.line} </>}
          {content.body}
        </p>
        {content.kept && <p className="upgrade-sheet-kept">{content.kept}</p>}

        <PremiumPurchaseAction
          premium={onAction ? { ...premium, startCheckout: (chosen) => { onAction('checkout', chosen); return premium.startCheckout(chosen); } } : premium}
          plan={plan}
        />
        {open && <p className="upgrade-sheet-terms">{(trial ? S.afterTrial : S.price)[plan]}</p>}
        </div>
        {!open && <p className="upgrade-sheet-note" role="status">{PLANS_PAGE.checkoutClosedDetail}</p>}
        {premium.error && <p className="upgrade-sheet-note" role="alert">{premium.error}</p>}

        {/* One row per plan, each with the price it charges. */}
        {open && <div className="upgrade-sheet-plans" role="group" aria-label={S.planLabel}>
          <button type="button" className="upgrade-sheet-plan" aria-pressed={annual} disabled={premium.busy} onClick={() => setAnnual(true)}>
            <span>
              <span className="upgrade-sheet-plan-name">{PLANS_PAGE.billing.annual}</span>
              <Tag label={PLANS_PAGE.billing.annualBadge} tone="sage" className="upgrade-sheet-plan-badge" />
            </span>
            <span className="upgrade-sheet-plan-price">{S.yearlyPrice}</span>
          </button>
          <button type="button" className="upgrade-sheet-plan" aria-pressed={!annual} disabled={premium.busy} onClick={() => setAnnual(false)}>
            <span><span className="upgrade-sheet-plan-name">{PLANS_PAGE.billing.monthly}</span></span>
            <span className="upgrade-sheet-plan-price">{S.monthlyPrice}</span>
          </button>
        </div>}

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
