// Customize My Lists: the sheet that puts the page's sections in the viewer's
// order. Rules and saving are in @plot/core/uiPrefs.js and useUiPrefs.js; this
// file only renders, with the same rows as the Sidebar order sheet.
//
// Mobile parity: app/(app)/my-lists-layout.tsx lists the same sections with
// up/down and Reset, and reads the same saved order.
import { CUSTOM_LISTS } from '@plot/core/copy/customLists.js';
import ResponsiveDialog from './ResponsiveDialog.jsx';
import { useStableClose } from '../hooks/useDialogClose.js';
import ReorderRows from './ReorderRows.jsx';
import './HomeLayoutSheet.css';

const C = CUSTOM_LISTS.sections;

/**
 * @param {{
 *   sections: { id: string, label: string }[],  the sections shown, in order
 *   isDefault: boolean,
 *   error: any,
 *   onNudge: (id: string, delta: -1 | 1) => void,
 *   onMove: (id: string, toIndex: number) => void,
 *   onReset: () => void,
 *   onClose: () => void,
 * }} props
 */
export default function MyListsLayoutSheet({ sections, isDefault, error, onNudge, onMove, onReset, onClose }) {
  const close = useStableClose(onClose);
  return (
    <ResponsiveDialog title={C.title} onClose={close} surfaceClassName="home-layout-sheet">
      <div className="home-layout-sheet-body">
        <p className="home-layout-sheet-intro">{C.body}</p>
        {error && <p className="home-layout-sheet-error" role="alert">{C.saveError}</p>}
        <ReorderRows
          rows={sections}
          onNudge={onNudge}
          onMove={onMove}
          labels={{ moveUp: C.moveUp, moveDown: C.moveDown, drag: C.drag }}
        />
        <button type="button" className="btn btn-secondary home-layout-reset" onClick={onReset} disabled={isDefault}>{C.reset}</button>
      </div>
    </ResponsiveDialog>
  );
}
