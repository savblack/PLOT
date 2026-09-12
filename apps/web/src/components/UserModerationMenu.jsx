import { useState } from 'react';
import KebabMenu from './KebabMenu.jsx';
import ConfirmModal from './ConfirmModal.jsx';
import ReportDialog from './ReportDialog.jsx';
import { MODERATION } from '../copy/moderation.js';

/**
 * The report / block control, for every surface that renders another account.
 * Guideline 1.2 wants both available wherever someone else's content appears,
 * and wants them independent of each other.
 *
 * `blocks` is the shared useBlocks result, passed in rather than called here on
 * purpose: a list of twenty search results would otherwise mount twenty copies
 * of the hook and fire twenty identical RPCs. One owner per screen, many menus.
 *
 * Renders nothing for the viewer's own row, and nothing when signed out —
 * there is nobody to attribute a report to.
 */
export default function UserModerationMenu({ targetId, targetName, surface, viewerId, blocks, onChanged }) {
  const [reporting, setReporting] = useState(false);
  const [confirmingBlock, setConfirmingBlock] = useState(false);

  if (!viewerId || !targetId || viewerId === targetId) return null;

  const blocked = blocks.isBlocked(targetId);
  const displayName = targetName || 'this account';

  const doBlock = async () => {
    await blocks.block(targetId);
    // The insert trigger drops follows in both directions server-side, so
    // whatever follow state the parent is holding is now wrong.
    onChanged?.();
  };

  const items = [
    { label: MODERATION.reportAction, onClick: () => setReporting(true) },
    blocked
      ? {
          label: MODERATION.unblockAction,
          onClick: async () => { await blocks.unblock(targetId); onChanged?.(); },
        }
      : {
          label: MODERATION.blockAction,
          danger: true,
          onClick: () => setConfirmingBlock(true),
        },
  ];

  return (
    <>
      <KebabMenu ariaLabel={`Options for ${displayName}`} items={items} />

      {reporting && (
        <ReportDialog
          targetId={targetId}
          targetName={targetName}
          surface={surface}
          viewerId={viewerId}
          onClose={() => setReporting(false)}
          // Offered inside the report flow, never required by it.
          onBlockToo={blocked ? null : doBlock}
        />
      )}

      {confirmingBlock && (
        <ConfirmModal
          title={MODERATION.blockTitle(displayName)}
          message={MODERATION.blockBody}
          confirmLabel={MODERATION.blockConfirm}
          danger
          onConfirm={doBlock}
          onClose={() => setConfirmingBlock(false)}
        />
      )}
    </>
  );
}
