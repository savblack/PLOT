import { useEffect } from 'react';
import { offerUndo, createUndoBatch, clearUndo, UNDO_ACTIONS } from '@plot/core/undo.js';
import { AppContext } from '../hooks/useApp.js';
import UndoToast from '../components/UndoToast.jsx';

/* The undo toast, driven by offers made from buttons instead of real removals.
   Reverts are no-ops that resolve (or reject, for the failure story) after a
   short delay, so nothing here touches data. */

const wait = (ms) => new Promise(resolve => setTimeout(resolve, ms));
const ok = () => wait(300);
const fail = async () => { await wait(300); throw Object.assign(new Error('offline'), { code: '' }); };

const OFFERS = {
  'Remove from Want to Watch': () => offerUndo({ action: UNDO_ACTIONS.WATCHLIST_REMOVE, title: 'Past Lives', revert: ok }),
  'Remove from a list': () => offerUndo({ action: UNDO_ACTIONS.LIST_ITEM_REMOVE, title: 'Aftersun', meta: { listName: 'Quiet ones' }, revert: ok }),
  Unfavourite: () => offerUndo({ action: UNDO_ACTIONS.FAVOURITE_REMOVE, title: 'Heat', revert: ok }),
  'Remove from history': () => offerUndo({ action: UNDO_ACTIONS.HISTORY_REMOVE, title: 'The Zone of Interest', revert: ok }),
  'Stop watching': () => offerUndo({ action: UNDO_ACTIONS.WATCHING_STOP, title: 'Severance', revert: ok }),
  'Un-tick an episode': () => offerUndo({ action: UNDO_ACTIONS.WATCH_PROGRESS, title: 'Severance', meta: { season: 2, episode: 3 }, revert: ok }),
  'Remove 5 selected': () => {
    const batch = createUndoBatch({ action: UNDO_ACTIONS.WATCHLIST_REMOVE });
    for (let i = 0; i < 5; i++) batch.add({ revert: ok });
    batch.offer();
  },
  'Undo that fails': () => offerUndo({ action: UNDO_ACTIONS.WATCHLIST_REMOVE, title: 'Dune: Part Two', revert: fail }),
};

function Harness({ region, autoOffer }) {
  useEffect(() => {
    if (autoOffer) OFFERS[autoOffer]();
    return () => clearUndo();
  }, [autoOffer]);
  return (
    <AppContext.Provider value={{ profile: { region } }}>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem', maxWidth: 520 }}>
        {Object.entries(OFFERS).map(([label, fire]) => (
          <button key={label} type="button" className="btn btn-secondary btn-sm" onClick={fire}>{label}</button>
        ))}
      </div>
      <UndoToast />
    </AppContext.Provider>
  );
}

export default {
  title: 'Components/UndoToast',
  component: UndoToast,
  parameters: { layout: 'fullscreen' },
  // index.css (the body font) is not loaded in Storybook; the app has it.
  decorators: [(Story) => <div style={{ minHeight: '100vh', padding: '1.5rem', fontFamily: 'var(--font-sans)' }}><Story /></div>],
};

export const Playground = { render: () => <Harness region="GB" autoOffer="Remove from Want to Watch" /> };
export const USSpelling = { render: () => <Harness region="US" autoOffer="Unfavourite" /> };
export const Batch = { render: () => <Harness region="GB" autoOffer="Remove 5 selected" /> };
export const Episode = { render: () => <Harness region="GB" autoOffer="Un-tick an episode" /> };
