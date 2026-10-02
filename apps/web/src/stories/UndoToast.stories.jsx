import { useEffect } from 'react';
import { expect, waitFor, within } from 'storybook/test';
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
  // Undo after creating a list deletes it (customListCreation.js createdListRevert).
  'Create a smart list': () => offerUndo({ action: UNDO_ACTIONS.SMART_LIST_CREATE, title: 'Short thrillers on my services', revert: ok }),
  'Create a list': () => offerUndo({ action: UNDO_ACTIONS.LIST_CREATE, title: 'Weekend', revert: ok }),
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
  decorators: [(Story) => <div style={{ minHeight: '100vh', padding: '1.5rem' }}><Story /></div>],
};

export const Playground = { render: () => <Harness region="GB" autoOffer="Remove from Want to Watch" /> };
export const USSpelling = { render: () => <Harness region="US" autoOffer="Unfavourite" /> };
export const Batch = { render: () => <Harness region="GB" autoOffer="Remove 5 selected" /> };
export const Episode = { render: () => <Harness region="GB" autoOffer="Un-tick an episode" /> };

/* Creating a list (PLO-513): every create flow that is the viewer's alone
   offers this. Shared lists do not: their members are already notified. */
const createdPlay = (message) => async ({ canvasElement }) => {
  const toast = await within(canvasElement).findByRole('status');
  // The toast fades in, so wait for it to settle before asking if it shows.
  await waitFor(() => expect(within(toast).getByText(message)).toBeVisible());
  await expect(within(toast).getByRole('button', { name: 'Undo' })).toBeVisible();
};
const PHONE = { viewport: { value: 'mobile2', isRotated: false } };
const DARK = { backgrounds: { value: '#0c0c0c' } };

export const SmartListCreated = {
  render: () => <Harness region="GB" autoOffer="Create a smart list" />,
  tags: ['interaction-test'],
  play: createdPlay('Smart list created.'),
};
export const SmartListCreatedDark = {
  render: () => <Harness region="GB" autoOffer="Create a smart list" />,
  globals: DARK,
  tags: ['interaction-test'],
  play: createdPlay('Smart list created.'),
};
// Chromatic ignores the viewport global, so the phone width is named for it too.
export const SmartListCreatedPhone = {
  render: () => <Harness region="GB" autoOffer="Create a smart list" />,
  globals: PHONE,
  parameters: { chromatic: { viewports: [414] } },
  tags: ['interaction-test'],
  play: createdPlay('Smart list created.'),
};
export const ListCreated = {
  render: () => <Harness region="GB" autoOffer="Create a list" />,
  tags: ['interaction-test'],
  play: createdPlay('List created.'),
};
