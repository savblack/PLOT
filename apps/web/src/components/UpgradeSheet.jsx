// In-app Premium upgrade sheet: opens where a Free limit is hit, leads with the
// feature that lifts it, and links to /plans for the full comparison. A bottom
// sheet on phones, a centred card wider up. Mobile has its own RN counterpart
// (apps/mobile/components/UpgradeSheet.tsx); content comes from @plot/core.
import { useEffect, useId, useRef } from 'react';
import { createPortal } from 'react-dom';
import { useLocation, useNavigate } from 'react-router-dom';
import { upgradeSheetContent } from '@plot/core/upgradeSheet.js';
import { useApp } from '../hooks/useApp.js';
import { usePremium } from '../hooks/usePremium.js';
import { PLANS_PAGE } from '../copy/plansPage.js';
import { premiumPlansPath } from '../utils/premiumExplore.js';
import PremiumIcon from './PremiumIcon.jsx';
import './UpgradeSheet.css';

const S = PLANS_PAGE.upgradeSheet;

/**
 * @param {{
 *   reason: import('@plot/core/upgradeSheet.js').UpgradeReason,
 *   onClose: () => void,
 *   returnFocusRef?: { current: HTMLElement | null },
 * }} props  returnFocusRef: where focus goes on close when the element that had
 *   it is gone (e.g. the create-list dialog the sheet replaced).
 */
export default function UpgradeSheet({ reason, onClose, returnFocusRef }) {
  const { profile } = useApp();
  const premium = usePremium(profile);
  const navigate = useNavigate();
  const location = useLocation();
  const sheetRef = useRef(null);
  const titleId = useId();
  const content = upgradeSheetContent(reason);
  // Callers pass inline handlers; reading them through refs keeps the setup
  // below to one run per open, so focus and scroll lock aren't reset on render.
  const onCloseRef = useRef(onClose);
  const returnRef = useRef(returnFocusRef);
  useEffect(() => { onCloseRef.current = onClose; returnRef.current = returnFocusRef; });

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
      const focusables = [...(sheetRef.current?.querySelectorAll('button:not(:disabled)') ?? [])];
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
    navigate(premiumPlansPath(location.pathname));
  };

  return createPortal(
    <div className="upgrade-sheet-layer">
      <div className="upgrade-sheet-scrim" onClick={onClose} aria-hidden="true" />
      <section ref={sheetRef} className="upgrade-sheet" role="dialog" aria-modal="true" aria-labelledby={titleId} tabIndex={-1}>
        <span className="upgrade-sheet-grab" aria-hidden="true" />
        <p className="upgrade-sheet-context">
          <span className="upgrade-sheet-meter" aria-hidden="true">
            {Array.from({ length: content.meter }, (_, i) => <i key={i} />)}
          </span>
          {content.context}
        </p>
        <h2 id={titleId} className="upgrade-sheet-title">{content.title}</h2>
        <p className="upgrade-sheet-body">{content.body}</p>

        <div className="upgrade-sheet-offer">
          <div className="upgrade-sheet-offer-name">
            <span>{PLANS_PAGE.premium.name}</span>
            <span className="upgrade-sheet-pill">{PLANS_PAGE.comingSoon}</span>
          </div>
          <div className="upgrade-sheet-price">
            <span className="upgrade-sheet-amount">{PLANS_PAGE.premium.price}</span>
            <span>{PLANS_PAGE.premium.period}</span>
          </div>
          <p className="upgrade-sheet-alt">{S.annualAlt}</p>
        </div>

        <button type="button" className="btn btn-primary" onClick={() => premium.startCheckout()}>
          {PLANS_PAGE.upgradeAction}
        </button>
        {premium.comingSoon && <p className="upgrade-sheet-note" role="status">{PLANS_PAGE.checkoutMessage}</p>}

        <p className="upgrade-sheet-also">{S.alsoIn}</p>
        <ul className="upgrade-sheet-rows">
          {content.also.map(row => (
            <li key={row.label}>
              <PremiumIcon name={row.icon} className="upgrade-sheet-icon" />
              <span>
                <span className="upgrade-sheet-row-label">{row.label}</span>
                {row.note && <span className="upgrade-sheet-row-note">{row.note}</span>}
              </span>
            </li>
          ))}
        </ul>

        <div className="upgrade-sheet-foot">
          <button type="button" className="upgrade-sheet-link" onClick={compare}>
            {S.compare} <span aria-hidden="true">→</span>
          </button>
          <button type="button" className="upgrade-sheet-link upgrade-sheet-link--quiet" onClick={onClose}>{S.notNow}</button>
        </div>
      </section>
    </div>,
    document.body,
  );
}
