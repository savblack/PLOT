// Settings > Appearance > Sidebar order: the sheet that reorders the desktop
// menu. Search stays first and Settings lives in the account menu, so only the
// middle of the rail is listed. Rules and saving are in @plot/core/uiPrefs.js
// and useUiPrefs.js; mobile has no sidebar.
import { SETTINGS_VIEW } from '@plot/core/copy/settingsView.js';
import ResponsiveDialog from './ResponsiveDialog.jsx';
import { useStableClose } from '../hooks/useDialogClose.js';
import ReorderRows from './ReorderRows.jsx';
import { movableSidebarItems } from '../navigation.js';
import './HomeLayoutSheet.css';

const C = SETTINGS_VIEW.sidebar;

/**
 * @param {{
 *   order: string[] | undefined,  saved ui_prefs.sidebar
 *   isDefault: boolean,
 *   error: any,
 *   onNudge: (currentIds: string[], id: string, delta: -1 | 1) => void,
 *   onMove: (currentIds: string[], id: string, toIndex: number) => void,
 *   onReset: () => void,
 *   onClose: () => void,
 * }} props
 */
export default function SidebarOrderSheet({ order, isDefault, error, onNudge, onMove, onReset, onClose }) {
  const items = movableSidebarItems(order);
  const ids = items.map(i => i.id);
  const close = useStableClose(onClose);
  return (
    <ResponsiveDialog title={C.title} onClose={close} surfaceClassName="home-layout-sheet">
      <div className="home-layout-sheet-body">
        <p className="home-layout-sheet-intro">{C.body}</p>
        {error && <p className="home-layout-sheet-error" role="alert">{C.saveError}</p>}
        <ReorderRows
          rows={items.map(i => ({ id: i.id, label: i.label }))}
          onNudge={(id, delta) => onNudge(ids, id, delta)}
          onMove={(id, to) => onMove(ids, id, to)}
          labels={{ moveUp: C.moveUp, moveDown: C.moveDown, drag: C.drag }}
        />
        <button type="button" className="btn btn-secondary home-layout-reset" onClick={onReset} disabled={isDefault}>{C.reset}</button>
      </div>
    </ResponsiveDialog>
  );
}
