import { useState } from 'react';
import { PLANS_PAGE } from '../copy/plansPage.js';
import UpgradeSheet from './UpgradeSheet.jsx';

/* The in-page button on a locked Premium feature. It opens the upgrade sheet
   for that feature and nothing else: no jump to the plans page, no confirm
   box (design audit pick 3.2 A, one upgrade sheet everywhere).

   One label for every gate. Pass children only where the surrounding sentence
   needs different words. */
export default function PremiumGateButton({ reason, className = 'btn btn-primary btn-sm', children, onOpen }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button type="button" className={className} onClick={() => { onOpen?.(); setOpen(true); }}>
        {children ?? PLANS_PAGE.upgradeSheet.open}
      </button>
      {open && <UpgradeSheet reason={reason} onClose={() => setOpen(false)} />}
    </>
  );
}
